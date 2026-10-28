// ===========================================================================
//  DossierBridge - Dossier, running.
//
//  Double-click Dossier.bat and this is what starts. It has no window. It
//  sits in the notification area beside the clock, with a menu - Open
//  Dossier, Show log, Start with Windows, Quit - so it is never a thing
//  running where you cannot see it or stop it.
//
//  WHAT IT DOES
//    - hands out the page at http://127.0.0.1:5500/dossier.html. Chrome and
//      Edge refuse notifications to a page opened from file://, and the page
//      and the database are then on one origin.
//    - creates the database if there is none, and brings its tables up to
//      date, by running sql\schema.sql and sql\load-proc.sql itself. There
//      is no "init" to remember.
//    - writes every change you make into SQL Server LocalDB, as one
//      transaction, and keeps the previous state before it replaces it.
//    - starts the script runner for your workspace, hidden, and stops it
//      again when it quits.
//    - calls the APIs you have set up as API actions, with the secrets they
//      need - which it keeps, encrypted for your Windows account, and never
//      hands back. See "YOUR APIS" at the end of this file.
//
//  With no LocalDB on the machine it still hands out the page, and Dossier
//  keeps its records in dossier.json as it always did.
//
//  WHAT IT IS NOT
//  It is not a web server you would put anything on. It binds the loopback
//  address only; it serves read-only GETs of a short list of file types out
//  of the folder dossier.html sits in, and nothing from your workspace; and
//  every route that touches the database needs a token generated fresh each
//  time it starts. The page gets that token either from .bridge.json in your
//  workspace folder, which only something that can already read your
//  records can read, or from /hello, which answers only a page this process
//  served itself - same origin, right Host header - and never to another
//  site.
//
//  WRITTEN FOR THE COMPILER ALREADY ON THE MACHINE
//  C# 5, because Dossier.bat builds this with the csc.exe that ships in
//  C:\Windows\Microsoft.NET\Framework64\v4.0.30319 rather than asking
//  anybody to install a toolchain. So: no string interpolation, no
//  expression-bodied members, no null-conditional operator, nothing newer.
//
//  A plain TcpListener rather than HttpListener, because HttpListener wants
//  a URL reservation and therefore an administrator, and this should not.
// ===========================================================================
using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

public partial class DossierBridge
{
    static string Token;
    static string ConnectionString;
    static string Database = "Dossier";
    static string Server = @"(localdb)\MSSQLLocalDB";
    static int Port;
    static int Wanted = 5500;           // the port dossier-serve.bat used
    static string AppRoot;              // the folder dossier.html sits in
    static string Workspace;            // the folder your records are in, if known
    static string HandshakePath;
    static string Here;                 // the folder this .exe is in

    static volatile bool DbOk;
    static volatile bool DbReady;       // the attempt has finished, one way or the other
    static string DbError = "";
    static bool HasHistory;

    static bool Headless;               // no tray, no dialogs, no browser: for tests
    static bool Quiet;                  // no browser on start: at login
    static Process Runner;
    static NotifyIcon Tray;
    static Mutex One;

    static readonly object LogLock = new object();
    //  Saves, one at a time. Each request is served on its own thread, and two
    //  saves in flight at once used to fight over the same tables - the page
    //  gave up on a slow one after a minute and sent the next while SQL was
    //  still writing the first. Now the second waits its turn, and a save
    //  that a newer one from the same window has overtaken while it waited is
    //  not written at all: the newer one carries everything it had.
    static readonly object SaveLock = new object();
    static readonly Dictionary<string, long> SaveNewest = new Dictionary<string, long>();
    static readonly List<string> LogLines = new List<string>();
    static string LogPath;

    const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";

    [DllImport("kernel32.dll")]
    static extern bool AttachConsole(int pid);

    [STAThread]
    public static int Main(string[] args)
    {
        Here = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
        LogPath = Path.Combine(Here, "dossier.log");
        try { if (File.Exists(LogPath) && new FileInfo(LogPath).Length > 1024 * 1024) File.Delete(LogPath); }
        catch (Exception) { }

        // flags anywhere; the rest positional, in the order the old
        // dossier-bridge.bat passed them: workspace, server, database, app
        List<string> pos = new List<string>();
        bool console = false;
        for (int i = 0; i < args.Length; i++)
        {
            string a = args[i];
            if (a == "--headless") Headless = true;
            else if (a == "--quiet") Quiet = true;
            else if (a == "--console") console = true;
            else pos.Add(a);
        }
        if (console || Headless)
        {
            // A windows program started from a console does not write to it
            // unless it asks. Without a console to attach to this fails, and
            // the log file still has everything.
            try { AttachConsole(-1); } catch (Exception) { }
        }
        if (pos.Count > 0 && pos[0].Length > 0) Workspace = pos[0];
        if (pos.Count > 1 && pos[1].Length > 0) Server = pos[1];
        if (pos.Count > 2 && pos[2].Length > 0) Database = pos[2];
        if (pos.Count > 3 && pos[3].Length > 0) AppRoot = pos[3];

        string env = Environment.GetEnvironmentVariable("DOSSIER_SQL");
        if (env != null && env.Length > 0 && pos.Count < 2) Server = env;
        env = Environment.GetEnvironmentVariable("DOSSIER_DB");
        if (env != null && env.Length > 0 && pos.Count < 3) Database = env;
        env = Environment.GetEnvironmentVariable("DOSSIER_PORT");
        if (env != null && env.Length > 0) int.TryParse(env, out Wanted);
        if (Environment.GetEnvironmentVariable("DOSSIER_OPEN") == "0") Quiet = true;

        // The name goes into CREATE DATABASE [..] and USE [..]; it is a name,
        // so it may look like one and nothing else.
        if (!Regex.IsMatch(Database, "^[A-Za-z0-9_]{1,100}$"))
        {
            Fail("The database name \"" + Database + "\" has characters a database name should not. Use letters, digits and _.");
            return 2;
        }

        // One of these at a time. A second double-click opens the page the
        // first one is already serving, rather than starting a second copy on
        // 5501 that the browser treats as a different site.
        bool first;
        One = new Mutex(true, "Local\\DossierBridge-" + Database, out first);
        if (!first)
        {
            int running = 0;
            try { int.TryParse(File.ReadAllText(Path.Combine(Here, ".port")).Trim(), out running); }
            catch (Exception) { }
            if (!Headless) OpenBrowser(running > 0 ? running : Wanted);
            return 0;
        }

        if (AppRoot == null)
            AppRoot = Path.GetFullPath(Path.Combine(Here, ".." + Path.DirectorySeparatorChar + ".."));
        AppRoot = Path.GetFullPath(AppRoot);
        if (!File.Exists(Path.Combine(AppRoot, "dossier.html")))
        {
            Log("  note      no dossier.html in " + AppRoot + " - not handing out the page");
            AppRoot = null;
        }

        Log("");
        Log("  Resolv   " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));

        ChooseWorkspace();

        ConnectionString = "Server=" + Server + ";Database=" + Database +
                           ";Integrated Security=true;MultipleActiveResultSets=true;" +
                           "Connect Timeout=60;Application Name=DossierBridge";

        Token = Guid.NewGuid().ToString("N");
        TcpListener listener = Bind(AppRoot == null ? 0 : Wanted, out Port);
        try { File.WriteAllText(Path.Combine(Here, ".port"), Port.ToString()); } catch (Exception) { }

        // written now, saying "starting", so a page opened from file:// in
        // the next few seconds waits for the database instead of deciding
        // there is none; written again when the database is settled
        WriteHandshake();

        Log("  workspace " + (Workspace ?? "(not chosen - scripts will not run by themselves)"));
        Log("  listening 127.0.0.1:" + Port);
        if (AppRoot != null) Log("  Resolv   " + Url());
        if (Port != Wanted && AppRoot != null)
        {
            Log("  Port " + Wanted + " was taken, so this is on " + Port + ". A browser counts that as a");
            Log("  different address, so Resolv will ask for your workspace folder once more.");
        }

        Thread serve = new Thread(delegate()
        {
            while (true)
            {
                TcpClient client;
                try { client = listener.AcceptTcpClient(); }
                catch (Exception) { return; }
                ThreadPool.QueueUserWorkItem(delegate(object state) { Serve((TcpClient)state); }, client);
            }
        });
        serve.IsBackground = true;
        serve.Start();

        // The page first, the database after. LocalDB takes ten or twenty
        // seconds to wake from cold, and a browser that opens straight away
        // onto "starting the database" is better than one that opens late.
        // Until it is done every database route says so, and the page waits
        // for it rather than deciding there is no database and writing a
        // file instead.
        Thread db = new Thread(delegate()
        {
            Migrate();
            DbReady = true;
            WriteHandshake();
            Log("  database  " + (DbOk ? Database + " on " + Server + " - ready" : "none - " + DbError));
        });
        db.IsBackground = true;
        db.Start();

        StartRunner();
        AppDomain.CurrentDomain.ProcessExit += delegate { Cleanup(); };

        if (!Quiet && !Headless && AppRoot != null) OpenBrowser(Port);

        if (Headless)
        {
            Console.CancelKeyPress += delegate { Cleanup(); };
            Thread.Sleep(Timeout.Infinite);
            return 0;
        }
        RunTray();
        Cleanup();
        try { listener.Stop(); } catch (Exception) { }
        GC.KeepAlive(One);      // held, not used: it is what makes this the only one
        return 0;
    }

    static string Url() { return "http://127.0.0.1:" + Port + "/dossier.html"; }

    static void OpenBrowser(int port)
    {
        try { Process.Start("http://127.0.0.1:" + port + "/dossier.html"); }
        catch (Exception e) { Log("  could not open a browser: " + e.Message); }
    }

    static bool cleaned;
    static void Cleanup()
    {
        lock (LogLock) { if (cleaned) return; cleaned = true; }
        StopRunner();
        if (HandshakePath != null) { try { File.Delete(HandshakePath); } catch (Exception) { } }
        try { File.Delete(Path.Combine(Here, ".port")); } catch (Exception) { }
        Log("  stopped   " + DateTime.Now.ToString("HH:mm:ss"));
    }

    // ── the log: a file beside the .exe and the last few hundred lines ──────
    static void Log(string line)
    {
        lock (LogLock)
        {
            LogLines.Add(line);
            if (LogLines.Count > 600) LogLines.RemoveRange(0, LogLines.Count - 600);
            try { File.AppendAllText(LogPath, line + Environment.NewLine); } catch (Exception) { }
        }
        try { Console.WriteLine(line); } catch (Exception) { }
    }

    static string LogText()
    {
        lock (LogLock) { return string.Join(Environment.NewLine, LogLines.ToArray()); }
    }

    static void Fail(string message)
    {
        Log("  ! " + message.Replace("\n", " "));
        if (!Headless)
        {
            try { MessageBox.Show(message, "Resolv", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
            catch (Exception) { }
        }
    }

    // ── which folder the records are in ─────────────────────────────────────
    //  Only needed for two things: the runner, which runs the scripts in that
    //  folder's scripts\, and .bridge.json, for a page opened from file://.
    //  The page served from here finds the database without it. So: asked
    //  once, remembered, and skippable.
    static void ChooseWorkspace()
    {
        string remembered = Path.Combine(Here, ".workspace.txt");
        if (Workspace == null && File.Exists(remembered))
        {
            try { Workspace = File.ReadAllText(remembered).Trim().Trim('"').Trim(); }
            catch (Exception) { Workspace = null; }
            if (Workspace != null && (Workspace.Length == 0 || !Directory.Exists(Workspace))) Workspace = null;
        }
        if (Workspace == null && !Headless && !File.Exists(remembered + ".skip"))
        {
            MessageBox.Show(
                "Which folder holds your records?\n\n" +
                "Pick the same folder you pick in Resolv - the one with your dossier.json in it. " +
                "It is remembered, so this is asked once.\n\n" +
                "It is used to run your scripts in the background. Cancel if you do not use scripts; " +
                "Resolv works without it.",
                "Resolv", MessageBoxButtons.OK, MessageBoxIcon.Information);
            using (FolderBrowserDialog pick = new FolderBrowserDialog())
            {
                pick.Description = "The folder that holds your records (dossier.json)";
                pick.ShowNewFolderButton = true;
                if (pick.ShowDialog() == DialogResult.OK) Workspace = pick.SelectedPath;
                else { try { File.WriteAllText(remembered + ".skip", "skipped"); } catch (Exception) { } }
            }
        }
        if (Workspace == null) return;

        Workspace = Path.GetFullPath(Workspace);
        if (!Directory.Exists(Workspace))
        {
            Fail("No such folder: " + Workspace);
            Workspace = null;
            return;
        }

        // The commonest mistake is the clone itself: git owns every file in
        // it, and a pull or a checkout can put an old file over new records.
        bool looksLikeClone = File.Exists(Path.Combine(Workspace, "dossier.html")) ||
                              Directory.Exists(Path.Combine(Workspace, ".git"));
        bool looksLikeWorkspace = File.Exists(Path.Combine(Workspace, "dossier.json")) ||
                                  File.Exists(Path.Combine(Workspace, ".bridge.json")) ||
                                  Directory.Exists(Path.Combine(Workspace, "tasks")) ||
                                  Directory.Exists(Path.Combine(Workspace, "backups"));
        if (looksLikeClone && !looksLikeWorkspace)
        {
            Fail("That folder is the Resolv program, not a folder of records:\n\n    " + Workspace +
                 "\n\nKeep your records in a folder of their own - Documents\\Resolv will do - " +
                 "and choose that one from the icon by the clock: Workspace folder...");
            Workspace = null;
            try { File.Delete(remembered); } catch (Exception) { }
            return;
        }
        try
        {
            File.WriteAllText(remembered, "\"" + Workspace + "\"");
            if (File.Exists(remembered + ".skip")) File.Delete(remembered + ".skip");
        }
        catch (Exception) { }
    }

    //  How a page opened from file:// finds us. It holds a handle on the
    //  workspace folder already, so this needs no configuration.
    static void WriteHandshake()
    {
        if (HandshakePath != null) { try { File.Delete(HandshakePath); } catch (Exception) { } HandshakePath = null; }
        if (Workspace == null) return;
        string handshake = "{\"port\":" + Port + ",\"token\":\"" + Token + "\",\"database\":" +
                           Json(Database) + ",\"server\":" + Json(Server) + ",\"db\":" + (DbOk ? "true" : "false") +
                           ",\"starting\":" + (DbReady ? "false" : "true") +
                           ",\"started\":" + Json(DateTime.UtcNow.ToString("o")) + "}";
        string path = Path.Combine(Workspace, ".bridge.json");
        try { File.WriteAllText(path, handshake, new UTF8Encoding(false)); HandshakePath = path; }
        catch (Exception e) { Log("  ! could not write " + path + ": " + e.Message); }
    }

    // ── the database, made and brought up to date ───────────────────────────
    //  schema.sql and load-proc.sql are written for sqlcmd: $(db) for the
    //  name, GO between batches, and one ":on error exit". Those three are the
    //  whole of what sqlcmd adds, so this does them itself and there is no
    //  "init" for anybody to run. Both files are idempotent and neither
    //  touches a row of data; running them at every start is the point.
    static void Migrate()
    {
        try
        {
            string schema = AppRoot == null ? null : Path.Combine(AppRoot, "sql" + Path.DirectorySeparatorChar + "schema.sql");
            string proc = AppRoot == null ? null : Path.Combine(AppRoot, "sql" + Path.DirectorySeparatorChar + "load-proc.sql");

            if (schema != null && File.Exists(schema))
            {
                string master = "Server=" + Server + ";Database=master;Integrated Security=true;" +
                                "Connect Timeout=60;Application Name=DossierBridge";
                using (SqlConnection c = new SqlConnection(master))
                {
                    c.InfoMessage += delegate(object s, SqlInfoMessageEventArgs e) { Log("  sql       " + e.Message); };
                    c.Open();
                    RunScript(c, File.ReadAllText(schema));
                }
            }
            using (SqlConnection c = new SqlConnection(ConnectionString))
            {
                c.InfoMessage += delegate(object s, SqlInfoMessageEventArgs e) { Log("  sql       " + e.Message); };
                c.Open();
                if (proc != null && File.Exists(proc)) RunScript(c, File.ReadAllText(proc));

                object v = Scalar(c, "SELECT Version FROM dbo.SchemaVersion WHERE Id = 1");
                Log("  schema    version " + v);
                object p = Scalar(c, "SELECT OBJECT_ID('dbo.LoadWorkspace', 'P')");
                if (p == null) throw new Exception("the loader dbo.LoadWorkspace is not in the database, and sql\\load-proc.sql was not found to create it");
                HasHistory = Scalar(c, "SELECT OBJECT_ID('dbo.WorkspaceHistory', 'U')") != null;
                if (HasHistory)
                {
                    // everything from the last fortnight; one a day before that
                    using (SqlCommand prune = new SqlCommand(
                        "DELETE FROM dbo.WorkspaceHistory WHERE TakenAt < DATEADD(day, -14, SYSUTCDATETIME()) " +
                        "AND HistoryId NOT IN (SELECT MAX(HistoryId) FROM dbo.WorkspaceHistory " +
                        "GROUP BY CAST(TakenAt AS date))", c))
                    {
                        prune.CommandTimeout = 120;
                        int n = prune.ExecuteNonQuery();
                        if (n > 0) Log("  history   pruned " + n + " copies older than a fortnight");
                    }
                }
            }
            DbOk = true;
        }
        catch (Exception e)
        {
            DbOk = false;
            DbError = e.Message;
            Log("  ! database: " + e.Message);
            Log("    Resolv will keep its records in dossier.json until this is fixed.");
            Log("    Is LocalDB installed?  sqllocaldb info   should list MSSQLLocalDB.");
        }
    }

    static void RunScript(SqlConnection c, string text)
    {
        foreach (string batch in Batches(text))
        {
            using (SqlCommand cmd = new SqlCommand(batch, c))
            {
                cmd.CommandTimeout = 300;
                cmd.ExecuteNonQuery();
            }
        }
    }

    //  sqlcmd's three additions, done here: $(db), GO, and :directives
    public static List<string> Batches(string text)
    {
        text = text.Replace("\r\n", "\n").Replace("$(db)", Database);
        List<string> batches = new List<string>();
        StringBuilder b = new StringBuilder();
        foreach (string line in text.Split('\n'))
        {
            string t = line.Trim();
            if (t.StartsWith(":")) continue;                          // :on error exit
            if (string.Equals(t, "GO", StringComparison.OrdinalIgnoreCase))
            {
                if (b.ToString().Trim().Length > 0) batches.Add(b.ToString());
                b.Length = 0;
                continue;
            }
            b.Append(line).Append('\n');
        }
        if (b.ToString().Trim().Length > 0) batches.Add(b.ToString());
        return batches;
    }

    // ── the runner, hidden ──────────────────────────────────────────────────
    static void StartRunner()
    {
        if (Workspace == null) return;
        string scripts = Path.Combine(Workspace, "scripts");
        if (!Directory.Exists(scripts)) { Log("  runner    no scripts folder in the workspace - nothing to run"); return; }

        // one already going - a window somebody opened by hand - is left alone:
        // two runners on one queue both claim the same request
        string beat = Path.Combine(scripts, "queue" + Path.DirectorySeparatorChar + ".runner.txt");
        try
        {
            if (File.Exists(beat) && (DateTime.Now - File.GetLastWriteTime(beat)).TotalSeconds < 30)
            {
                Log("  runner    one is already running on this workspace; leaving it be");
                return;
            }
        }
        catch (Exception) { }

        string bat = Path.Combine(scripts, "dossier-runner.bat");
        if (!File.Exists(bat) && AppRoot != null)
            bat = Path.Combine(AppRoot, "scripts" + Path.DirectorySeparatorChar + "dossier-runner.bat");
        if (!File.Exists(bat)) return;
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c \"\"" + bat + "\"\"");
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            psi.WorkingDirectory = scripts;
            psi.EnvironmentVariables["DOSSIER_SCRIPTS"] = scripts;
            Runner = Process.Start(psi);
            Log("  runner    running hidden, on " + scripts);
        }
        catch (Exception e) { Log("  ! runner: " + e.Message); }
    }

    static void StopRunner()
    {
        Process r = Runner;
        Runner = null;
        if (r == null) return;
        try
        {
            if (r.HasExited) return;
            // the runner is cmd.exe, and a script it is in the middle of is a
            // child of that; /T takes the whole tree
            ProcessStartInfo kill = new ProcessStartInfo("taskkill", "/PID " + r.Id + " /T /F");
            kill.UseShellExecute = false;
            kill.CreateNoWindow = true;
            Process.Start(kill).WaitForExit(5000);
        }
        catch (Exception) { try { r.Kill(); } catch (Exception) { } }
    }

    // ── the icon by the clock ───────────────────────────────────────────────
    static void RunTray()
    {
        Application.EnableVisualStyles();
        Tray = new NotifyIcon();
        Tray.Icon = LoadIcon();
        Tray.Text = TrayText();

        ContextMenuStrip menu = new ContextMenuStrip();
        ToolStripItem open = menu.Items.Add("Open Resolv", null, delegate { OpenBrowser(Port); });
        open.Font = new Font(open.Font, FontStyle.Bold);
        menu.Items.Add("Show log", null, delegate { ShowLog(); });
        menu.Items.Add(new ToolStripSeparator());
        ToolStripMenuItem login = new ToolStripMenuItem("Start with Windows");
        login.Checked = StartsWithWindows();
        login.Click += delegate
        {
            SetStartsWithWindows(!login.Checked);
            login.Checked = StartsWithWindows();
        };
        menu.Items.Add(login);
        menu.Items.Add("Workspace folder...", null, delegate
        {
            using (FolderBrowserDialog pick = new FolderBrowserDialog())
            {
                pick.Description = "The folder that holds your records (dossier.json)";
                if (Workspace != null) pick.SelectedPath = Workspace;
                if (pick.ShowDialog() != DialogResult.OK) return;
                StopRunner();
                Workspace = pick.SelectedPath;
                ChooseWorkspace();
                WriteHandshake();
                StartRunner();
                Tray.Text = TrayText();
            }
        });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quit Resolv", null, delegate
        {
            Tray.Visible = false;
            Application.Exit();
        });
        Tray.ContextMenuStrip = menu;
        Tray.DoubleClick += delegate { OpenBrowser(Port); };
        Tray.Text = "Resolv - starting the database";
        Tray.Visible = true;

        // said from this thread, once the database attempt has finished
        System.Windows.Forms.Timer settle = new System.Windows.Forms.Timer();
        settle.Interval = 500;
        settle.Tick += delegate
        {
            if (!DbReady) return;
            settle.Stop();
            Tray.Text = TrayText();
            if (!DbOk)
                Tray.ShowBalloonTip(8000, "Resolv - no database",
                    "Records stay in dossier.json. Show log says why.", ToolTipIcon.Warning);
            else if (Quiet)
                Tray.ShowBalloonTip(4000, "Resolv is running", "Double-click this icon to open it.", ToolTipIcon.Info);
        };
        settle.Start();

        Application.Run();
        Tray.Visible = false;
        Tray.Dispose();
    }

    static string TrayText()
    {
        string t = "Resolv - 127.0.0.1:" + Port + (DbOk ? " - SQL Server" : " - no database");
        return t.Length > 63 ? t.Substring(0, 63) : t;
    }

    static Icon LoadIcon()
    {
        try
        {
            if (AppRoot != null)
            {
                string ico = Path.Combine(AppRoot, "favicon.ico");
                if (File.Exists(ico)) return new Icon(ico, 16, 16);
            }
        }
        catch (Exception) { }
        return SystemIcons.Application;
    }

    static Form LogForm;
    static void ShowLog()
    {
        if (LogForm != null && !LogForm.IsDisposed) { LogForm.Activate(); return; }
        LogForm = new Form();
        LogForm.Text = "Resolv - log";
        LogForm.Width = 760; LogForm.Height = 460;
        LogForm.StartPosition = FormStartPosition.CenterScreen;
        LogForm.Icon = LoadIcon();
        TextBox box = new TextBox();
        box.Multiline = true; box.ReadOnly = true; box.ScrollBars = ScrollBars.Both; box.WordWrap = false;
        box.Dock = DockStyle.Fill;
        box.Font = new Font("Consolas", 9f);
        box.Text = LogText();
        FlowLayoutPanel bar = new FlowLayoutPanel();
        bar.Dock = DockStyle.Bottom; bar.Height = 38; bar.FlowDirection = FlowDirection.RightToLeft;
        Button close = new Button(); close.Text = "Close"; close.Click += delegate { LogForm.Close(); };
        Button copy = new Button(); copy.Text = "Copy"; copy.Click += delegate { try { Clipboard.SetText(LogText()); } catch (Exception) { } };
        Button file = new Button(); file.Text = "Open file"; file.Width = 90;
        file.Click += delegate { try { Process.Start("notepad.exe", "\"" + LogPath + "\""); } catch (Exception) { } };
        bar.Controls.Add(close); bar.Controls.Add(copy); bar.Controls.Add(file);
        LogForm.Controls.Add(box);
        LogForm.Controls.Add(bar);
        System.Windows.Forms.Timer tick = new System.Windows.Forms.Timer();
        tick.Interval = 1500;
        tick.Tick += delegate
        {
            string now = LogText();
            if (now != box.Text) { box.Text = now; box.SelectionStart = box.Text.Length; box.ScrollToCaret(); }
        };
        LogForm.FormClosed += delegate { tick.Stop(); tick.Dispose(); };
        tick.Start();
        LogForm.Show();
        box.SelectionStart = box.Text.Length; box.ScrollToCaret();
    }

    // Start with Windows: the per-user Run key. No administrator, no service,
    // no scheduled task, and no console window at login - it runs this .exe
    // directly, quietly, and it shows up in Task Manager's Startup tab where
    // anybody can switch it off.
    static bool StartsWithWindows()
    {
        try
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey, false))
                return k != null && k.GetValue("Dossier") != null;
        }
        catch (Exception) { return false; }
    }

    static void SetStartsWithWindows(bool on)
    {
        try
        {
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (on)
                {
                    string exe = System.Reflection.Assembly.GetExecutingAssembly().Location;
                    k.SetValue("Dossier", "\"" + exe + "\" --quiet");
                }
                else if (k.GetValue("Dossier") != null) k.DeleteValue("Dossier");
            }
        }
        catch (Exception e) { Fail("Could not change the login setting: " + e.Message); }
    }

    // ── the smallest HTTP that works ────────────────────────────────────────
    static void Serve(object state)
    {
        TcpClient client = (TcpClient)state;
        try
        {
            using (client)
            using (NetworkStream net = client.GetStream())
            {
                net.ReadTimeout = 30000;
                net.WriteTimeout = 60000;

                string requestLine;
                Dictionary<string, string> headers;
                byte[] body;
                if (!ReadRequest(net, out requestLine, out headers, out body)) return;

                string[] bits = requestLine.Split(' ');
                if (bits.Length < 2) { Respond(net, 400, "text/plain", Bytes("bad request")); return; }
                string method = bits[0].ToUpperInvariant();
                string path = bits[1];
                string query = "";
                int q = path.IndexOf('?');
                if (q >= 0) { query = path.Substring(q + 1); path = path.Substring(0, q); }

                if (method == "OPTIONS") { Respond(net, 204, null, new byte[0]); return; }

                if (path == "/hello") { Hello(net, method, headers); return; }

                // The page itself and the few files beside it. A browser
                // fetching a page cannot be told to carry a token, so these
                // are open - and they are read-only GETs of a short list of
                // file types out of the folder dossier.html sits in, which is
                // a checkout of a public repository. Your records are not in
                // that folder, and nothing below will serve them if they are.
                bool api = (path == "/health" || path == "/workspace" || path == "/attachment" || path == "/history" ||
                            path == "/secrets" || path == "/call" || path == "/run");
                if (!api)
                {
                    if ((method == "GET" || method == "HEAD") && Static(net, path, method == "HEAD")) return;
                    Respond(net, 404, "text/plain", Bytes("Resolv is at /dossier.html"));
                    return;
                }

                // Everything that touches the database needs the token. A page
                // that cannot read the workspace folder cannot have it.
                string given = Header(headers, "x-dossier-token");
                if (given != Token)
                {
                    Respond(net, 403, "application/json",
                            Bytes("{\"error\":\"bad or missing token\"}"));
                    return;
                }

                try
                {
                    // Your APIs need no database: the secrets are in your
                    // Windows profile and the calls go straight out.
                    if (path == "/secrets") { SecretsRoute(net, method, query, body); return; }
                    if (path == "/call")
                    {
                        if (method == "POST") CallRoute(net, body);
                        else Respond(net, 405, "application/json", Bytes("{\"error\":\"POST\"}"));
                        return;
                    }
                    if (path == "/run")
                    {
                        if (method == "POST") RunRoute(net, body);
                        else Respond(net, 405, "application/json", Bytes("{\"error\":\"POST\"}"));
                        return;
                    }
                    if (!DbReady)
                    {
                        Respond(net, method == "GET" && path == "/health" ? 200 : 503, "application/json",
                                Bytes("{\"ok\":false,\"starting\":true,\"error\":\"the database is starting\"}"));
                        return;
                    }
                    if (method == "GET" && path == "/health") { Health(net); return; }
                    if (!DbOk)
                    {
                        Respond(net, 503, "application/json",
                                Bytes("{\"error\":" + Json("no database: " + DbError) + ",\"db\":false}"));
                        return;
                    }
                    if (method == "GET" && path == "/workspace") { GetWorkspace(net); return; }
                    if (method == "PUT" && path == "/workspace") { PutWorkspace(net, headers, body); return; }
                    if (method == "GET" && path == "/history") { GetHistory(net, query); return; }
                    if (method == "POST" && path == "/attachment") { PostAttachment(net, headers, body); return; }
                    if (method == "GET" && path == "/attachment") { GetAttachment(net, query); return; }
                    if (method == "DELETE" && path == "/attachment") { DeleteAttachment(net, query); return; }
                    Respond(net, 404, "application/json", Bytes("{\"error\":\"no such route\"}"));
                }
                catch (Exception e)
                {
                    Log("  ! " + method + " " + path + ": " + e.Message);
                    Respond(net, 500, "application/json",
                            Bytes("{\"error\":" + Json(e.Message) + "}"));
                }
            }
        }
        catch (Exception) { /* a dropped connection is not news */ }
    }

    //  The token, to the page this process served and to nothing else.
    //    - Host must be 127.0.0.1:<this port>. A site that rebinds its own
    //      name to 127.0.0.1 still sends its own name here.
    //    - Sec-Fetch-Site must be same-origin. The browser sets it and a page
    //      cannot, and a fetch from any other site - or any other port on
    //      this machine - says cross-site or same-site instead.
    //    - no Access-Control-Allow-Origin on the answer, so a request that got
    //      this far from somewhere else still could not read it.
    static void Hello(NetworkStream net, string method, Dictionary<string, string> headers)
    {
        if (method != "GET"
            || Header(headers, "host") != "127.0.0.1:" + Port
            || Header(headers, "sec-fetch-site") != "same-origin")
        {
            Respond(net, 403, "application/json", Bytes("{\"error\":\"not from here\"}"), false, false);
            return;
        }
        string json = "{\"port\":" + Port + ",\"token\":" + Json(Token) + ",\"db\":" + (DbOk ? "true" : "false") +
                      ",\"starting\":" + (DbReady ? "false" : "true") +
                      ",\"database\":" + Json(Database) + ",\"server\":" + Json(Server) +
                      ",\"error\":" + Json(DbOk ? "" : DbError) +
                      ",\"workspace\":" + Json(Workspace == null ? "" : Path.GetFileName(Workspace)) + "}";
        Respond(net, 200, "application/json", Bytes(json), false, false);
    }

    static bool ReadRequest(NetworkStream net, out string requestLine,
                            out Dictionary<string, string> headers, out byte[] body)
    {
        requestLine = null;
        headers = new Dictionary<string, string>();
        body = new byte[0];

        MemoryStream head = new MemoryStream();
        int b, run = 0;
        while ((b = net.ReadByte()) >= 0)
        {
            head.WriteByte((byte)b);
            if (b == (int)'\n') { run++; if (run == 2) break; }
            else if (b != (int)'\r') run = 0;
            if (head.Length > 64 * 1024) return false;     // a header block that big is not honest
        }
        if (head.Length == 0) return false;

        string text = Encoding.ASCII.GetString(head.ToArray());
        string[] lines = text.Split(new string[] { "\r\n", "\n" }, StringSplitOptions.None);
        requestLine = lines[0];
        for (int i = 1; i < lines.Length; i++)
        {
            int c = lines[i].IndexOf(':');
            if (c <= 0) continue;
            headers[lines[i].Substring(0, c).Trim().ToLowerInvariant()] = lines[i].Substring(c + 1).Trim();
        }

        int len = 0;
        string cl = Header(headers, "content-length");
        if (cl.Length > 0) int.TryParse(cl, out len);
        if (len > 0)
        {
            // 64 MB is more than any screenshot and less than a mistake
            if (len > 64 * 1024 * 1024) return false;
            byte[] buf = new byte[len];
            int got = 0;
            while (got < len)
            {
                int n = net.Read(buf, got, len - got);
                if (n <= 0) break;
                got += n;
            }
            body = buf;
        }
        return true;
    }

    static string Header(Dictionary<string, string> h, string name)
    {
        string v;
        if (h.TryGetValue(name, out v)) return v;
        return "";
    }

    static void Respond(NetworkStream net, int status, string type, byte[] payload)
    {
        Respond(net, status, type, payload, false, true);
    }

    static void Respond(NetworkStream net, int status, string type, byte[] payload, bool headOnly)
    {
        Respond(net, status, type, payload, headOnly, true);
    }

    static void Respond(NetworkStream net, int status, string type, byte[] payload, bool headOnly, bool cors)
    {
        StringBuilder h = new StringBuilder();
        h.Append("HTTP/1.1 ").Append(status).Append(" ").Append(StatusText(status)).Append("\r\n");
        if (cors)
        {
            // A page opened from file:// has the origin "null". Nothing can
            // use the database routes without the token anyway.
            h.Append("Access-Control-Allow-Origin: *\r\n");
            h.Append("Access-Control-Allow-Headers: content-type, x-dossier-token, x-dossier-confirm, x-dossier-reason, x-dossier-seq, x-name, x-type, x-record\r\n");
            h.Append("Access-Control-Allow-Methods: GET, PUT, POST, DELETE, OPTIONS\r\n");
            h.Append("Access-Control-Max-Age: 600\r\n");
            // Chrome's private network access checks ask for this by name
            h.Append("Access-Control-Allow-Private-Network: true\r\n");
        }
        h.Append("Cache-Control: no-store\r\n");
        if (type != null) h.Append("Content-Type: ").Append(type).Append("\r\n");
        h.Append("Content-Length: ").Append(payload.Length).Append("\r\n");
        h.Append("Connection: close\r\n\r\n");
        byte[] head = Encoding.ASCII.GetBytes(h.ToString());
        net.Write(head, 0, head.Length);
        if (payload.Length > 0 && !headOnly) net.Write(payload, 0, payload.Length);
        net.Flush();
    }

    static string StatusText(int s)
    {
        if (s == 200) return "OK";
        if (s == 204) return "No Content";
        if (s == 400) return "Bad Request";
        if (s == 403) return "Forbidden";
        if (s == 404) return "Not Found";
        if (s == 409) return "Conflict";
        if (s == 500) return "Internal Server Error";
        if (s == 503) return "Service Unavailable";
        return "Status";
    }

    static byte[] Bytes(string s) { return new UTF8Encoding(false).GetBytes(s); }

    static string Json(string s)
    {
        if (s == null) return "null";
        StringBuilder b = new StringBuilder("\"");
        foreach (char c in s)
        {
            if (c == '"') b.Append("\\\"");
            else if (c == '\\') b.Append("\\\\");
            else if (c == '\n') b.Append("\\n");
            else if (c == '\r') b.Append("\\r");
            else if (c == '\t') b.Append("\\t");
            else if (c < ' ') b.Append("\\u").Append(((int)c).ToString("x4"));
            else b.Append(c);
        }
        return b.Append("\"").ToString();
    }

    // ── handing out the page ────────────────────────────────────────────────
    //  A browser keeps a folder handle per origin, and the port is part of the
    //  origin, so a port that wanders means being asked for your workspace
    //  folder again every morning. Ask for the same one each time; take a
    //  neighbour if it is busy; fall back to whatever is free rather than
    //  refusing to start.
    static TcpListener Bind(int wanted, out int port)
    {
        port = 0;
        for (int p = wanted; wanted > 0 && p < wanted + 10; p++)
        {
            try
            {
                TcpListener l = new TcpListener(IPAddress.Loopback, p);
                l.Start();
                port = p;
                return l;
            }
            catch (SocketException) { }
        }
        TcpListener any = new TcpListener(IPAddress.Loopback, 0);
        any.Start();
        port = ((IPEndPoint)any.LocalEndpoint).Port;
        return any;
    }

    //  Read-only, GET and HEAD, out of AppRoot, and only the kinds of file an
    //  application is made of. Note what is not on that list: .json. So a
    //  dossier.json, a .bridge.json or a backup cannot be served even by a
    //  person who put their workspace inside the clone - on top of the rule
    //  against ".." and against any name beginning with a dot.
    static bool Static(NetworkStream net, string path, bool headOnly)
    {
        if (AppRoot == null) return false;

        string rel;
        try { rel = Uri.UnescapeDataString(path); }
        catch (Exception) { return false; }
        if (rel.Length == 0 || rel[0] != '/') return false;
        if (rel == "/") rel = "/dossier.html";
        if (rel.IndexOf('\\') >= 0 || rel.IndexOf('\0') >= 0) return false;

        string[] seg = rel.Substring(1).Split('/');
        for (int i = 0; i < seg.Length; i++)
        {
            if (seg[i].Length == 0) return false;           // "//" or a trailing slash
            if (seg[i][0] == '.') return false;             // "..", ".git", ".bridge.json"
            string low = seg[i].ToLowerInvariant();
            if (low == "backups" || low == "tasks") return false;
        }

        string type = ContentType(seg[seg.Length - 1]);
        if (type == null) return false;

        string root = AppRoot;
        if (!root.EndsWith(Path.DirectorySeparatorChar.ToString()))
            root += Path.DirectorySeparatorChar;
        string full;
        try { full = Path.GetFullPath(Path.Combine(root, string.Join(Path.DirectorySeparatorChar.ToString(), seg))); }
        catch (Exception) { return false; }
        if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) return false;
        if (!File.Exists(full)) return false;

        byte[] payload;
        try { payload = File.ReadAllBytes(full); }
        catch (Exception) { return false; }
        Respond(net, 200, type, payload, headOnly);
        return true;
    }

    static string ContentType(string name)
    {
        int dot = name.LastIndexOf('.');
        if (dot < 0) return null;
        switch (name.Substring(dot + 1).ToLowerInvariant())
        {
            case "html": case "htm":  return "text/html; charset=utf-8";
            case "js": case "mjs":    return "text/javascript; charset=utf-8";
            case "css":               return "text/css; charset=utf-8";
            case "txt":               return "text/plain; charset=utf-8";
            case "md":                return "text/markdown; charset=utf-8";
            case "xml":               return "application/xml; charset=utf-8";
            case "svg":               return "image/svg+xml";
            case "gif":               return "image/gif";
            case "png":               return "image/png";
            case "jpg": case "jpeg":  return "image/jpeg";
            case "webp":              return "image/webp";
            case "ico":               return "image/x-icon";
            case "woff":              return "font/woff";
            case "woff2":             return "font/woff2";
            case "ttf":               return "font/ttf";
            case "otf":               return "font/otf";
            case "wasm":              return "application/wasm";
            case "map":               return "application/octet-stream";
            default:                  return null;
        }
    }

    // ── the routes ──────────────────────────────────────────────────────────
    static void Health(NetworkStream net)
    {
        if (!DbOk)
        {
            Respond(net, 200, "application/json",
                    Bytes("{\"ok\":false,\"db\":false,\"error\":" + Json(DbError) + "}"));
            return;
        }
        using (SqlConnection c = Open())
        {
            object ver = Scalar(c, "SELECT Version FROM dbo.SchemaVersion WHERE Id = 1");
            object recs = Scalar(c, "SELECT ISNULL(Records, 0) FROM dbo.Workspace WHERE Id = 1");
            object at = Scalar(c, "SELECT CONVERT(varchar(33), UpdatedAt, 126) FROM dbo.Workspace WHERE Id = 1");
            string json = "{\"ok\":true,\"db\":true,\"database\":" + Json(Database) + ",\"server\":" + Json(Server) +
                          ",\"schema\":" + (ver == null ? "0" : ver.ToString()) +
                          ",\"records\":" + (recs == null ? "0" : recs.ToString()) +
                          ",\"history\":" + (HasHistory ? "true" : "false") +
                          ",\"updated\":" + Json(at == null ? "" : at.ToString()) + "}";
            Respond(net, 200, "application/json", Bytes(json));
        }
    }

    static void GetWorkspace(NetworkStream net)
    {
        using (SqlConnection c = Open())
        {
            object doc = Scalar(c, "SELECT Doc FROM dbo.Workspace WHERE Id = 1");
            if (doc == null)
            {
                // an empty database is not an error; it is a new workspace -
                // or one whose records are still in the file beside them,
                // which the page brings in rather than saving over
                Respond(net, 200, "application/json", Bytes("{\"empty\":true}"));
                return;
            }
            Respond(net, 200, "application/json", Bytes(doc.ToString()));
        }
    }

    //  Everything Dossier writes comes through here, and it is one
    //  transaction: the whole workspace, and every table derived from it, or
    //  none of it.
    //
    //  Two things happen first that did not before 4.2.
    //
    //  A save that would leave far fewer records than it replaces - none at
    //  all, or less than half of ten or more - is refused with 409 unless the
    //  page says the person asked for it. That is what an empty workspace
    //  saving itself over a full one looks like from here, and it is the one
    //  write that must never happen by accident.
    //
    //  And the row being replaced is kept, compressed, in WorkspaceHistory:
    //  every ten minutes in ordinary use, always when the count drops, always
    //  for a restore or an import.
    static void PutWorkspace(NetworkStream net, Dictionary<string, string> headers, byte[] body)
    {
        string doc = new UTF8Encoding(false).GetString(body);
        if (doc.Length == 0)
        {
            Respond(net, 400, "application/json", Bytes("{\"error\":\"empty body\"}"));
            return;
        }
        bool confirmed = Header(headers, "x-dossier-confirm") == "shrink";
        string reason = Header(headers, "x-dossier-reason");
        if (!Regex.IsMatch(reason, "^[a-z ]{1,24}$")) reason = "save";

        //  "<window>:<rev>" - which open window sent it, and how far along
        //  that window's changes it was
        string seq = Header(headers, "x-dossier-seq"), win = null;
        long rev = -1;
        int colon = seq.LastIndexOf(':');
        if (colon > 0 && colon < 80 && long.TryParse(seq.Substring(colon + 1), out rev)) win = seq.Substring(0, colon);
        if (win != null)
            lock (SaveNewest)
            {
                long have;
                if (!SaveNewest.TryGetValue(win, out have) || rev > have) SaveNewest[win] = rev;
                if (SaveNewest.Count > 200) SaveNewest.Clear();
            }

        Stopwatch clock = Stopwatch.StartNew();
        lock (SaveLock)
        {
        long waited = clock.ElapsedMilliseconds;
        if (win != null && reason == "save")
        {
            long newest;
            lock (SaveNewest) { if (!SaveNewest.TryGetValue(win, out newest)) newest = rev; }
            if (newest > rev)
            {
                Log("  skipped   a save overtaken by a newer one from the same window (waited " + waited + " ms)");
                Respond(net, 200, "application/json", Bytes("{\"ok\":true,\"superseded\":true}"));
                return;
            }
        }
        using (SqlConnection c = Open())
        {
            int incoming = 0, current = -1;
            using (SqlCommand count = new SqlCommand(
                "SELECT CASE WHEN ISJSON(@doc) = 1 THEN (SELECT COUNT(*) FROM OPENJSON(@doc, '$.tasks')) ELSE -1 END", c))
            {
                count.Parameters.Add("@doc", SqlDbType.NVarChar, -1).Value = doc;
                incoming = Convert.ToInt32(count.ExecuteScalar());
            }
            object cur = Scalar(c, "SELECT ISNULL(Records, 0) FROM dbo.Workspace WHERE Id = 1");
            if (cur != null) current = Convert.ToInt32(cur);

            if (Shrinks(current, incoming) && !confirmed)
            {
                Log("  refused   a save of " + incoming + " record(s) over " + current + " - not confirmed");
                Respond(net, 409, "application/json",
                        Bytes("{\"error\":" + Json("This save would take the database from " + current +
                              " records to " + incoming + ". Nothing was written.") +
                              ",\"shrink\":true,\"current\":" + current + ",\"incoming\":" + incoming + "}"));
                return;
            }

            using (SqlTransaction tx = c.BeginTransaction())
            {
                try
                {
                    if (HasHistory && current >= 0)
                    {
                        using (SqlCommand keep = new SqlCommand(
                            "DECLARE @last datetime2(0) = (SELECT MAX(TakenAt) FROM dbo.WorkspaceHistory); " +
                            "IF @why <> N'save' OR @fewer = 1 OR @last IS NULL OR @last < DATEADD(minute, -10, SYSUTCDATETIME()) " +
                            "INSERT dbo.WorkspaceHistory (Records, Bytes, Reason, Doc) " +
                            "SELECT Records, DATALENGTH(Doc), CASE WHEN @fewer = 1 THEN N'before ' + @why + N', fewer records' " +
                            "ELSE N'before ' + @why END, COMPRESS(Doc) FROM dbo.Workspace WHERE Id = 1;", c, tx))
                        {
                            keep.Parameters.Add("@why", SqlDbType.NVarChar, 30).Value = reason;
                            keep.Parameters.Add("@fewer", SqlDbType.Bit).Value = incoming < current;
                            keep.CommandTimeout = 120;
                            keep.ExecuteNonQuery();
                        }
                    }
                    using (SqlCommand cmd = new SqlCommand("dbo.LoadWorkspace", c, tx))
                    {
                        cmd.CommandType = CommandType.StoredProcedure;
                        cmd.CommandTimeout = 120;
                        SqlParameter p = cmd.Parameters.Add("@doc", SqlDbType.NVarChar, -1);
                        p.Value = doc;
                        cmd.ExecuteNonQuery();
                    }
                    tx.Commit();
                }
                catch (Exception)
                {
                    try { tx.Rollback(); } catch (Exception) { }
                    throw;
                }
            }
            if (reason != "save") Log("  " + reason.PadRight(9) + " " + incoming + " record(s); the state before it is kept");
            object recs = Scalar(c, "SELECT ISNULL(Records, 0) FROM dbo.Workspace WHERE Id = 1");
            long took = clock.ElapsedMilliseconds;
            //  the slow ones are the ones worth knowing about
            if (took > 3000)
                Log("  slow save " + incoming + " record(s), " + (body.Length / 1024) + " KB in " +
                    (took / 1000.0).ToString("0.0") + " s" + (waited > 500 ? " (" + waited + " ms of it waiting for the save before)" : ""));
            Respond(net, 200, "application/json",
                    Bytes("{\"ok\":true,\"records\":" + (recs == null ? "0" : recs.ToString()) +
                          ",\"ms\":" + took + ",\"waited\":" + waited + "}"));
        }
        }
    }

    //  Down to nothing, or to less than half of ten or more. One record at a
    //  time never trips it; an empty workspace saving over a full one does.
    public static bool Shrinks(int current, int incoming)
    {
        return current > 0 && (incoming <= 0 || (current >= 10 && incoming * 2 < current));
    }

    //  Every earlier state there is: the bridge's own history and every file
    //  ever pushed. Without an id, the list; with one, that document whole.
    static void GetHistory(NetworkStream net, string query)
    {
        string id = QueryValue(query, "id");
        using (SqlConnection c = Open())
        {
            if (id.Length > 1)
            {
                int n;
                if (!int.TryParse(id.Substring(1), out n)) { Respond(net, 400, "application/json", Bytes("{\"error\":\"bad id\"}")); return; }
                string sql = id[0] == 'h' && HasHistory
                    ? "SELECT CAST(DECOMPRESS(Doc) AS nvarchar(max)) FROM dbo.WorkspaceHistory WHERE HistoryId = @n"
                    : id[0] == 's' ? "SELECT Doc FROM dbo.Snapshot WHERE SnapshotId = @n" : null;
                if (sql == null) { Respond(net, 400, "application/json", Bytes("{\"error\":\"bad id\"}")); return; }
                using (SqlCommand cmd = new SqlCommand(sql, c))
                {
                    cmd.Parameters.Add("@n", SqlDbType.Int).Value = n;
                    cmd.CommandTimeout = 120;
                    object doc = cmd.ExecuteScalar();
                    if (doc == null || doc == DBNull.Value) { Respond(net, 404, "application/json", Bytes("{\"error\":\"no such copy\"}")); return; }
                    Respond(net, 200, "application/json", Bytes(doc.ToString()));
                }
                return;
            }

            string list =
                "SELECT TOP 300 HistId, TakenAt, Records, Bytes, Why FROM (" +
                (HasHistory
                  ? "SELECT 'h' + CAST(HistoryId AS varchar(12)) AS HistId, TakenAt, Records, Bytes, Reason AS Why " +
                    "FROM dbo.WorkspaceHistory UNION ALL "
                  : "") +
                "SELECT 's' + CAST(SnapshotId AS varchar(12)), TakenAt, Records, Bytes, N'pushed ' + ISNULL(Source, N'') " +
                "FROM dbo.Snapshot) AS x ORDER BY TakenAt DESC";
            StringBuilder b = new StringBuilder("{\"items\":[");
            using (SqlCommand cmd = new SqlCommand(list, c))
            using (SqlDataReader r = cmd.ExecuteReader())
            {
                bool firstRow = true;
                while (r.Read())
                {
                    if (!firstRow) b.Append(',');
                    firstRow = false;
                    b.Append("{\"id\":").Append(Json(r.GetString(0)))
                     .Append(",\"at\":").Append(Json(r.GetDateTime(1).ToString("yyyy-MM-ddTHH:mm:ssZ")))
                     .Append(",\"records\":").Append(r.IsDBNull(2) ? "0" : r.GetInt32(2).ToString())
                     .Append(",\"bytes\":").Append(r.IsDBNull(3) ? "0" : r.GetInt32(3).ToString())
                     .Append(",\"why\":").Append(Json(r.IsDBNull(4) ? "" : r.GetString(4)))
                     .Append('}');
                }
            }
            b.Append("]}");
            Respond(net, 200, "application/json", Bytes(b.ToString()));
        }
    }

    static void PostAttachment(NetworkStream net, Dictionary<string, string> headers, byte[] body)
    {
        string id = Guid.NewGuid().ToString("N").Substring(0, 24);
        string name = Decode(Header(headers, "x-name"));
        string type = Decode(Header(headers, "x-type"));
        string record = Decode(Header(headers, "x-record"));
        using (SqlConnection c = Open())
        using (SqlCommand cmd = new SqlCommand(
            "INSERT dbo.Attachment (AttachmentId, RecordId, Name, Type, Bytes, Content) " +
            "VALUES (@id, @rec, @name, @type, @len, @bytes)", c))
        {
            cmd.Parameters.AddWithValue("@id", id);
            cmd.Parameters.AddWithValue("@rec", (object)record ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@name", (object)name ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@type", (object)type ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@len", body.Length);
            SqlParameter p = cmd.Parameters.Add("@bytes", SqlDbType.VarBinary, -1);
            p.Value = body;
            cmd.CommandTimeout = 120;
            cmd.ExecuteNonQuery();
        }
        Respond(net, 200, "application/json",
                Bytes("{\"ok\":true,\"id\":" + Json(id) + ",\"bytes\":" + body.Length + "}"));
    }

    static void GetAttachment(NetworkStream net, string query)
    {
        string id = QueryValue(query, "id");
        using (SqlConnection c = Open())
        using (SqlCommand cmd = new SqlCommand(
            "SELECT Content, Type FROM dbo.Attachment WHERE AttachmentId = @id", c))
        {
            cmd.Parameters.AddWithValue("@id", id);
            using (SqlDataReader r = cmd.ExecuteReader())
            {
                if (!r.Read())
                {
                    Respond(net, 404, "application/json", Bytes("{\"error\":\"no such attachment\"}"));
                    return;
                }
                byte[] content = r.IsDBNull(0) ? new byte[0] : (byte[])r[0];
                string type = r.IsDBNull(1) ? "application/octet-stream" : r.GetString(1);
                if (type.Length == 0) type = "application/octet-stream";
                Respond(net, 200, type, content);
            }
        }
    }

    static void DeleteAttachment(NetworkStream net, string query)
    {
        string id = QueryValue(query, "id");
        using (SqlConnection c = Open())
        using (SqlCommand cmd = new SqlCommand("DELETE dbo.Attachment WHERE AttachmentId = @id", c))
        {
            cmd.Parameters.AddWithValue("@id", id);
            int n = cmd.ExecuteNonQuery();
            Respond(net, 200, "application/json", Bytes("{\"ok\":true,\"deleted\":" + n + "}"));
        }
    }

    // ── odds and ends ───────────────────────────────────────────────────────
    static SqlConnection Open()
    {
        SqlConnection c = new SqlConnection(ConnectionString);
        c.Open();
        return c;
    }

    static object Scalar(SqlConnection c, string sql)
    {
        using (SqlCommand cmd = new SqlCommand(sql, c))
        {
            object v = cmd.ExecuteScalar();
            if (v == DBNull.Value) return null;
            return v;
        }
    }

    static string QueryValue(string query, string key)
    {
        string[] parts = query.Split('&');
        for (int i = 0; i < parts.Length; i++)
        {
            int eq = parts[i].IndexOf('=');
            if (eq <= 0) continue;
            if (parts[i].Substring(0, eq) == key) return Uri.UnescapeDataString(parts[i].Substring(eq + 1));
        }
        return "";
    }

    // a file name can hold anything, so it travels as a percent-escaped
    // header rather than as raw bytes in one
    static string Decode(string s)
    {
        if (s == null || s.Length == 0) return "";
        try { return Uri.UnescapeDataString(s); }
        catch (Exception) { return s; }
    }
}

// ===========================================================================
//  YOUR APIS - called from here, with secrets nothing else ever holds
//
//  An "API action" is a short recipe written in Resolv (Menu -> Scripts):
//  a few HTTP steps, what each one keeps from its answer, and which of
//  those values are secret. "Regenerate COI" is the worked example - sign
//  in with a client id and secret, keep the access token, call the COI
//  endpoint with it. The page cannot make any of those calls: its content
//  security policy lets it reach 127.0.0.1 and nothing else. So they are
//  made here, and that is what makes it possible to keep the credentials
//  out of the page - and out of the assistant, which only ever sees what
//  the page hands it.
//
//  THE RULES, all of them enforced in this file
//    - A secret is typed once into Resolv and handed straight here. It is
//      written to your Windows profile, encrypted with DPAPI for your
//      Windows account (secrets.txt, %LOCALAPPDATA%\Resolv), and it never
//      goes back: there is no route that returns a secret's value, only its
//      name, the hosts it may go to and when it was saved.
//    - A secret may only be sent to the hosts it was saved for. So may
//      anything obtained with it - the token a sign-in hands back is bound
//      to the same hosts as the client secret that got it. A recipe that
//      has been changed, or an assistant that has been talked into
//      something by an email, still cannot send them anywhere else. To send
//      a secret to a new host, it has to be saved again, value and all.
//    - Only https may carry one, except to this machine itself.
//    - A redirect is never followed: it would send the request, headers and
//      all, to wherever the answer said.
//    - A value a step keeps as secret stays here. The page gets a handle -
//      @kept:<random> - that is no use to anybody, expires in 30 minutes
//      and with this process, and can be passed back into a later call
//      (into an input marked kept) to be swapped for the value at the last
//      moment. That is how one API's answer feeds the next without the
//      assistant ever seeing it. A value kept with "reveal" is returned as
//      well, because somebody decided it should be.
//    - Any secret this call touched is masked - "••••" - in everything it
//      returns or logs: addresses, error messages, the excerpt of a failed
//      answer, and the values it kept.
//    - A script can be given a secret too (POST /run): as an environment
//      variable, only if the secret was saved for that script by name, and
//      masked out of what the script prints.
// ===========================================================================
public partial class DossierBridge
{
    class CallError : Exception { public CallError(string m) : base(m) { } }

    //  one value inside a call: what it is, whether it is secret, where it may go
    class Val { public string Text; public bool Secret; public List<string> Hosts; public string Label; }
    class Secret { public string Name; public string Value; public List<string> Hosts; public string Saved; }
    class Kept { public string Name; public string Value; public List<string> Hosts; public DateTime Expires; }
    class Answer
    {
        public int Status; public string Reason; public string Type; public WebHeaderCollection Headers;
        public byte[] Bytes; public string FileName; public long Ms;
        string text;
        public string Text() { if (text == null) text = new UTF8Encoding(false).GetString(Bytes ?? new byte[0]); return text; }
    }

    static readonly object SecretLock = new object();
    static readonly object KeptLock = new object();
    static readonly Dictionary<string, Kept> KeptValues = new Dictionary<string, Kept>();
    static readonly byte[] SecretEntropy = Encoding.UTF8.GetBytes("Resolv secrets v1");
    static bool TlsSet;
    const int KeptMinutes = 30;
    const int StepTimeoutMs = 30000;
    const int MaxSteps = 10;
    const int MaxAnswerBytes = 20 * 1024 * 1024;
    const string Dots = "••••";
    static readonly Regex NameRe = new Regex("^[A-Za-z][A-Za-z0-9_.-]{0,40}$");
    static readonly Regex HostRe = new Regex(@"^(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*(:\d{1,5})?$");
    static readonly Regex HandleRe = new Regex("^@kept:[a-z2-7]{20}$");
    static readonly Regex ScriptPlaceRe = new Regex(@"^script:[a-z0-9][a-z0-9_.()-]{0,120}\.(bat|cmd)$");
    static readonly Regex SlotRe = new Regex(@"\{\{\s*(secret:)?([A-Za-z][A-Za-z0-9_.-]{0,40})\s*\}\}");
    static readonly string[] Methods = { "GET", "POST", "PUT", "PATCH", "DELETE" };

    // ── the store ───────────────────────────────────────────────────────────
    static string SecretsPath()
    {
        string p = Environment.GetEnvironmentVariable("DOSSIER_SECRETS");
        if (p != null && p.Length > 0) return p;
        string root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(Path.Combine(root, "Resolv"), "secrets.txt");
    }

    static List<string> SplitHosts(string s)
    {
        List<string> list = new List<string>();
        foreach (string raw in (s ?? "").Split(new char[] { ',', ';', ' ', '\n', '\r', '\t' }, StringSplitOptions.RemoveEmptyEntries))
        {
            string h = raw.Trim().ToLowerInvariant();
            // script:renew-cert.bat - a script that may be given it, as an
            // environment variable, by POST /run
            if (h.StartsWith("script:"))
            {
                if (ScriptPlaceRe.IsMatch(h) && list.IndexOf(h) < 0) list.Add(h);
                continue;
            }
            int scheme = h.IndexOf("://");
            if (scheme >= 0) h = h.Substring(scheme + 3);
            int slash = h.IndexOf('/');
            if (slash >= 0) h = h.Substring(0, slash);
            if (h.Length > 0 && HostRe.IsMatch(h) && list.IndexOf(h) < 0) list.Add(h);
        }
        return list;
    }

    //  read under SecretLock. Values only when the call needs them, and a
    //  value this Windows account cannot decrypt - saved by somebody else, or
    //  on another PC and copied here - comes back null rather than throwing.
    static List<Secret> ReadSecrets(bool values)
    {
        List<Secret> list = new List<Secret>();
        string path = SecretsPath();
        if (!File.Exists(path)) return list;
        foreach (string line in File.ReadAllLines(path, Encoding.UTF8))
        {
            string[] f = line.Split('\t');
            if (f.Length < 4 || f[0].Length == 0) continue;
            Secret s = new Secret();
            s.Name = f[0]; s.Hosts = SplitHosts(f[1]); s.Saved = f[2];
            if (values)
            {
                try
                {
                    byte[] plain = ProtectedData.Unprotect(Convert.FromBase64String(f[3]), SecretEntropy,
                                                           DataProtectionScope.CurrentUser);
                    s.Value = Encoding.UTF8.GetString(plain);
                }
                catch (Exception) { s.Value = null; }
            }
            list.Add(s);
        }
        return list;
    }

    static void WriteSecretLines(List<string> lines)
    {
        string path = SecretsPath();
        string dir = Path.GetDirectoryName(path);
        if (dir != null && dir.Length > 0 && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
        string tmp = path + ".tmp";
        File.WriteAllLines(tmp, lines.ToArray(), new UTF8Encoding(false));
        if (File.Exists(path)) File.Delete(path);
        File.Move(tmp, path);
    }

    static List<string> SecretLinesExcept(string name)
    {
        List<string> keep = new List<string>();
        string path = SecretsPath();
        if (File.Exists(path))
            foreach (string l in File.ReadAllLines(path, Encoding.UTF8))
                if (l.Length > 0 && l.Split('\t')[0] != name) keep.Add(l);
        return keep;
    }

    // ── the routes ──────────────────────────────────────────────────────────
    //  GET     names, hosts and when each was saved - never a value
    //  POST    {name, value, hosts}: save one, replacing one of that name
    //  DELETE  ?name=
    static void SecretsRoute(NetworkStream net, string method, string query, byte[] body)
    {
        if (method == "GET")
        {
            List<Secret> list;
            lock (SecretLock) list = ReadSecrets(true);
            List<object> outp = new List<object>();
            foreach (Secret s in list)
            {
                Dictionary<string, object> d = new Dictionary<string, object>();
                d["name"] = s.Name; d["hosts"] = s.Hosts; d["saved"] = s.Saved;
                d["readable"] = s.Value != null;
                outp.Add(d);
            }
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["secrets"] = outp;
            Respond(net, 200, "application/json", Bytes(Ser().Serialize(r)));
            return;
        }
        if (method == "POST")
        {
            Dictionary<string, object> req = ParseObject(body);
            string name = Str(req, "name"), value = Str(req, "value");
            List<string> hosts = new List<string>();
            object h = req == null ? null : (req.ContainsKey("hosts") ? req["hosts"] : null);
            if (h is string) hosts = SplitHosts((string)h);
            else foreach (object x in AsList(h)) hosts.AddRange(SplitHosts(Convert.ToString(x)));
            string bad = null;
            if (name == null || !NameRe.IsMatch(name)) bad = "A secret's name is a letter, then letters, digits, _ . or -, up to 41 of them.";
            else if (value == null || value.Length == 0) bad = "A secret needs a value.";
            else if (value.Length > 16384) bad = "That value is longer than 16,384 characters.";
            else if (hosts.Count == 0) bad = "A secret needs at least one place it may go - a host like api.example.com or *.example.com, or a script like script:renew-cert.bat.";
            if (bad != null) { Respond(net, 400, "application/json", Bytes("{\"error\":" + Json(bad) + "}")); return; }
            byte[] sealedValue = ProtectedData.Protect(Encoding.UTF8.GetBytes(value), SecretEntropy, DataProtectionScope.CurrentUser);
            lock (SecretLock)
            {
                List<string> lines = SecretLinesExcept(name);
                lines.Add(name + "\t" + string.Join(",", hosts.ToArray()) + "\t" + DateTime.UtcNow.ToString("o") +
                          "\t" + Convert.ToBase64String(sealedValue));
                WriteSecretLines(lines);
            }
            Log("  secret    saved " + name + " for " + string.Join(", ", hosts.ToArray()));
            Respond(net, 200, "application/json", Bytes("{\"ok\":true}"));
            return;
        }
        if (method == "DELETE")
        {
            string name = QueryValue(query, "name");
            bool had;
            lock (SecretLock)
            {
                List<string> lines = SecretLinesExcept(name);
                had = ReadSecrets(false).Exists(delegate(Secret s) { return s.Name == name; });
                if (had) WriteSecretLines(lines);
            }
            if (had) Log("  secret    forgot " + name);
            Respond(net, had ? 200 : 404, "application/json", Bytes(had ? "{\"ok\":true}" : "{\"error\":\"no such secret\"}"));
            return;
        }
        Respond(net, 405, "application/json", Bytes("{\"error\":\"GET, POST or DELETE\"}"));
    }

    //  POST {recipe, params}. Always answers 200 with {ok, ...} once the call
    //  was attempted, so the page can show which step stopped it and why.
    static void CallRoute(NetworkStream net, byte[] body)
    {
        Dictionary<string, object> req = ParseObject(body);
        Dictionary<string, object> recipe = req == null ? null : req.ContainsKey("recipe") ? req["recipe"] as Dictionary<string, object> : null;
        if (recipe == null) { Respond(net, 400, "application/json", Bytes("{\"error\":\"send {recipe, params}\"}")); return; }
        Dictionary<string, object> pars = req.ContainsKey("params") ? req["params"] as Dictionary<string, object> : null;
        Dictionary<string, object> result = RunRecipe(recipe, pars ?? new Dictionary<string, object>());
        Respond(net, 200, "application/json", Bytes(Ser().Serialize(result)));
    }

    // ── running a recipe ────────────────────────────────────────────────────
    static Dictionary<string, object> RunRecipe(Dictionary<string, object> recipe, Dictionary<string, object> pars)
    {
        Dictionary<string, object> outp = new Dictionary<string, object>();
        List<object> stepsOut = new List<object>();
        Dictionary<string, object> values = new Dictionary<string, object>();
        Dictionary<string, object> kept = new Dictionary<string, object>();
        List<object> files = new List<object>();
        List<string> revealed = new List<string>();
        List<string> masks = new List<string>();
        string name = Str(recipe, "name") ?? "API action";
        outp["name"] = name; outp["ok"] = false; outp["steps"] = stepsOut; outp["values"] = values;
        outp["kept"] = kept; outp["files"] = files; outp["revealed"] = revealed;
        outp["error"] = ""; outp["failedStep"] = "";
        string current = "";
        List<string> logBits = new List<string>();
        try
        {
            Dictionary<string, Val> vars = ReadInputs(Obj(recipe, "inputs"), pars, masks);
            List<object> steps = AsList(recipe.ContainsKey("steps") ? recipe["steps"] : null);
            if (steps.Count == 0) throw new CallError("This action has no steps.");
            if (steps.Count > MaxSteps) throw new CallError("An action may have at most " + MaxSteps + " steps.");
            for (int i = 0; i < steps.Count; i++)
            {
                Dictionary<string, object> st = steps[i] as Dictionary<string, object>;
                if (st == null) throw new CallError("Step " + (i + 1) + " is not a step.");
                current = Str(st, "name") ?? ("Step " + (i + 1));
                Dictionary<string, object> so = RunStep(st, current, vars, values, kept, files, revealed, masks);
                stepsOut.Add(so);
                logBits.Add(current + " " + so["status"] + " " + so["ms"] + " ms");
                if (!(bool)so["ok"])
                {
                    outp["failedStep"] = current;
                    outp["error"] = so["error"];
                    break;
                }
                current = "";
            }
            outp["ok"] = Convert.ToString(outp["failedStep"]) == "";
        }
        catch (CallError e)
        {
            outp["error"] = e.Message;
            outp["failedStep"] = current;
            logBits.Add((current.Length > 0 ? current + ": " : "") + "refused");
        }
        catch (Exception e)
        {
            outp["error"] = "The call broke: " + e.Message;
            outp["failedStep"] = current;
            logBits.Add("broke");
        }
        // masked on the way out - every secret this call touched, wherever it
        // turned up - except a value somebody decided to reveal
        masks.Sort(delegate(string a, string b) { return b.Length.CompareTo(a.Length); });
        outp["error"] = Mask(Convert.ToString(outp["error"]), masks);
        foreach (object o in stepsOut)
        {
            Dictionary<string, object> d = (Dictionary<string, object>)o;
            d["url"] = Mask(Convert.ToString(d["url"]), masks);
            if (d.ContainsKey("error")) d["error"] = Mask(Convert.ToString(d["error"]), masks);
            if (d.ContainsKey("excerpt")) d["excerpt"] = Mask(Convert.ToString(d["excerpt"]), masks);
        }
        List<string> keys = new List<string>(values.Keys);
        foreach (string k in keys)
            if (revealed.IndexOf(k) < 0) values[k] = Mask(Convert.ToString(values[k]), masks);
        Log("  call      " + name + ": " + (logBits.Count > 0 ? string.Join("; ", logBits.ToArray()) : "nothing sent") +
            ((bool)outp["ok"] ? "" : " - " + Convert.ToString(outp["error"])));
        return outp;
    }

    //  what the call was given: plain text checked against the input's
    //  pattern, or - for an input marked kept - a handle from an earlier call
    static Dictionary<string, Val> ReadInputs(Dictionary<string, object> inputs, Dictionary<string, object> pars, List<string> masks)
    {
        Dictionary<string, Val> vars = new Dictionary<string, Val>();
        foreach (KeyValuePair<string, object> kv in inputs)
        {
            if (!NameRe.IsMatch(kv.Key)) throw new CallError("\"" + kv.Key + "\" is not a name an input can have.");
            Dictionary<string, object> spec = kv.Value as Dictionary<string, object> ?? new Dictionary<string, object>();
            string label = Str(spec, "label") ?? kv.Key;
            string raw = pars.ContainsKey(kv.Key) && pars[kv.Key] != null ? Convert.ToString(pars[kv.Key], CultureInfo.InvariantCulture).Trim() : "";
            Val v = new Val();
            v.Label = label;
            if (Bool(spec, "kept"))
            {
                if (raw.Length == 0) throw new CallError("This action needs " + label + " - a value kept by an earlier call.");
                if (!HandleRe.IsMatch(raw)) throw new CallError(label + " takes a value kept by an earlier call (@kept:...), not text.");
                Kept k = FindKept(raw);
                if (k == null) throw new CallError("The kept value given for " + label + " has expired, or this bridge was restarted since. Run the call that kept it again.");
                v.Text = k.Value; v.Secret = true; v.Hosts = k.Hosts;
                masks.Add(k.Value);
            }
            else
            {
                if (raw.Length == 0)
                {
                    if (!Bool(spec, "optional")) throw new CallError("This action needs " + label + ".");
                }
                else
                {
                    if (raw.StartsWith("@kept:")) throw new CallError(label + " takes text. A kept value can only go into an input marked kept, so that it stays bound to its hosts.");
                    if (raw.Length > 2000) throw new CallError(label + " is longer than 2,000 characters.");
                    foreach (char ch in raw) if (ch < ' ' && ch != '\t') throw new CallError(label + " has a line break or a control character in it.");
                    string pattern = Str(spec, "pattern");
                    if (pattern != null && pattern.Length > 0)
                    {
                        bool ok;
                        try { ok = Regex.IsMatch(raw, pattern, RegexOptions.None, TimeSpan.FromSeconds(1)); }
                        catch (Exception) { throw new CallError("The pattern for " + label + " is not a regular expression this can use."); }
                        if (!ok) throw new CallError("\"" + raw + "\" is not a valid " + label + Example(spec) + ".");
                    }
                }
                v.Text = raw; v.Secret = false;
            }
            vars[kv.Key] = v;
        }
        return vars;
    }

    static string Example(Dictionary<string, object> spec)
    {
        string e = Str(spec, "example");
        return e != null && e.Length > 0 ? " (like " + e + ")" : "";
    }

    static Dictionary<string, object> RunStep(Dictionary<string, object> st, string sname, Dictionary<string, Val> vars,
        Dictionary<string, object> values, Dictionary<string, object> kept, List<object> files, List<string> revealed, List<string> masks)
    {
        Dictionary<string, object> so = new Dictionary<string, object>();
        string method = (Str(st, "method") ?? "GET").ToUpperInvariant();
        if (Array.IndexOf(Methods, method) < 0) throw new CallError(sname + ": " + method + " is not GET, POST, PUT, PATCH or DELETE.");
        string urlT = Str(st, "url") ?? "";
        // where a step goes is part of the recipe, never part of what it is given
        int sep = urlT.IndexOf("://");
        string authority = sep < 0 ? "" : urlT.Substring(sep + 3);
        int end = authority.IndexOfAny(new char[] { '/', '?', '#' });
        if (end >= 0) authority = authority.Substring(0, end);
        if (sep < 0 || authority.Length == 0) throw new CallError(sname + ": the address has to start with https://.");
        if (authority.IndexOf("{{") >= 0) throw new CallError(sname + ": the host in the address cannot be filled in - only the path and the query can.");

        List<Val> used = new List<Val>();
        string url = Expand(urlT, vars, used, "url", masks);
        Uri u;
        if (!Uri.TryCreate(url, UriKind.Absolute, out u) || (u.Scheme != "https" && u.Scheme != "http"))
            throw new CallError(sname + ": " + Mask(url, masks) + " is not an http or https address.");

        Dictionary<string, string> hdrs = new Dictionary<string, string>();
        string ctype = "";
        foreach (KeyValuePair<string, object> h in Obj(st, "headers"))
        {
            string hv = Expand(Convert.ToString(h.Value, CultureInfo.InvariantCulture), vars, used, "header", masks);
            if (hv.IndexOf('\r') >= 0 || hv.IndexOf('\n') >= 0) throw new CallError(sname + ": the header " + h.Key + " would carry a line break.");
            hdrs[h.Key] = hv;
            if (h.Key.ToLowerInvariant() == "content-type") ctype = hv.ToLowerInvariant();
        }
        string bodyS = null;
        object bodyO = st.ContainsKey("body") ? st["body"] : null;
        if (bodyO != null)
        {
            string bodyT = bodyO is string ? (string)bodyO : Ser().Serialize(bodyO);
            if (!(bodyO is string) && ctype.Length == 0) { ctype = "application/json"; hdrs["Content-Type"] = "application/json"; }
            string kind = ctype.IndexOf("json") >= 0 ? "json" : ctype.IndexOf("x-www-form-urlencoded") >= 0 ? "form" : "raw";
            bodyS = Expand(bodyT, vars, used, kind, masks);
        }

        // the rules, before a byte leaves this machine
        List<string> bound = new List<string>();
        bool carries = false;
        foreach (Val v in used)
        {
            if (!v.Secret) continue;
            carries = true;
            if (!HostAllowed(v.Hosts, u))
                throw new CallError(sname + " goes to " + u.Host + ", and " + v.Label + " may only be sent to " +
                                    string.Join(", ", v.Hosts.ToArray()) + ". Save the secret again with that host if it belongs there.");
            foreach (string hh in v.Hosts) if (bound.IndexOf(hh) < 0) bound.Add(hh);
        }
        if (carries && u.Scheme != "https" && !u.IsLoopback)
            throw new CallError(sname + " would send a secret to " + u.Host + " over plain http. Only https may carry one.");

        so["name"] = sname; so["method"] = method; so["host"] = u.Host; so["url"] = u.ToString();
        Answer a = Send(method, u, hdrs, bodyS, sname, masks);
        so["status"] = a.Status; so["ms"] = a.Ms;
        List<object> accept = AsList(st.ContainsKey("accept") ? st["accept"] : null);
        bool good = (a.Status >= 200 && a.Status < 300);
        foreach (object x in accept) { int n; if (int.TryParse(Convert.ToString(x), out n) && n == a.Status) good = true; }
        so["ok"] = good;
        if (!good)
        {
            string ex = a.Text();
            if (ex.Length > 600) ex = ex.Substring(0, 600) + "…";
            so["excerpt"] = ex;
            so["error"] = sname + " answered " + a.Status + (a.Reason != null && a.Reason.Length > 0 ? " " + a.Reason : "") +
                          (a.Status >= 300 && a.Status < 400 ? " - a redirect, which is never followed" : "") + ".";
            return so;
        }

        // what the step keeps from its answer
        object parsed = null;
        bool tried = false;
        foreach (KeyValuePair<string, object> k in Obj(st, "keep"))
        {
            if (!NameRe.IsMatch(k.Key)) throw new CallError(sname + ": \"" + k.Key + "\" is not a name a kept value can have.");
            // A string is a path into the JSON answer, always. The status, a
            // header or the whole body are asked for by name instead, because
            // any word reserved inside a path collides with some API's field:
            // "status" is the commonest field there is.
            string from, what; bool secret = false, reveal = false, optional = false;
            Dictionary<string, object> spec = k.Value as Dictionary<string, object>;
            string got;
            if (spec == null) { from = Convert.ToString(k.Value, CultureInfo.InvariantCulture); what = from; got = Pick(a, from, ref parsed, ref tried); }
            else
            {
                secret = Bool(spec, "secret"); reveal = Bool(spec, "reveal"); optional = Bool(spec, "optional");
                string header = Str(spec, "header");
                if (Bool(spec, "status")) { what = "status"; got = a.Status.ToString(CultureInfo.InvariantCulture); }
                else if (Bool(spec, "body")) { what = "body"; got = a.Text(); }
                else if (header != null && header.Length > 0) { what = header + " header"; got = a.Headers == null ? null : a.Headers[header]; }
                else { from = Str(spec, "from"); what = from; got = Pick(a, from, ref parsed, ref tried); }
            }
            if (got == null)
            {
                if (!optional) { so["ok"] = false; so["error"] = sname + " answered " + a.Status + ", but its answer had no " + what + "."; return so; }
                got = "";
            }
            Val v = new Val();
            v.Text = got; v.Secret = secret; v.Label = k.Key;
            if (secret)
            {
                // bound to wherever the secrets that obtained it may go; with
                // none, to the host that handed it out
                v.Hosts = bound.Count > 0 ? new List<string>(bound) : new List<string>(new string[] { AuthorityOf(u) });
                if (got.Length > 0) masks.Add(got);
                Dictionary<string, object> kd = new Dictionary<string, object>();
                kd["handle"] = Keep(k.Key, got, v.Hosts);
                kd["expires"] = DateTime.UtcNow.AddMinutes(KeptMinutes).ToString("o");
                kd["hosts"] = v.Hosts;
                kept[k.Key] = kd;
                if (reveal) { values[k.Key] = got; if (revealed.IndexOf(k.Key) < 0) revealed.Add(k.Key); }
            }
            else values[k.Key] = got;
            vars[k.Key] = v;
        }

        // an answer that is a document - a COI, a PDF, an export
        string save = Str(st, "save");
        if (save != null && save.Length > 0)
        {
            List<Val> fileUsed = new List<Val>();
            string fname = Expand(save, vars, fileUsed, "raw", masks);
            foreach (Val fv in fileUsed) if (fv.Secret) throw new CallError(sname + ": a file name cannot be made from a secret.");
            fname = Regex.Replace(fname, "[\\\\/:*?\"<>|\\x00-\\x1f]+", " ").Trim();
            if (fname.Length == 0) fname = a.FileName ?? "answer";
            Dictionary<string, object> fd = new Dictionary<string, object>();
            fd["name"] = fname; fd["type"] = a.Type ?? "application/octet-stream";
            fd["size"] = a.Bytes.Length; fd["data"] = Convert.ToBase64String(a.Bytes);
            files.Add(fd);
        }
        return so;
    }

    static string AuthorityOf(Uri u)
    {
        return u.Host.ToLowerInvariant() + (u.IsDefaultPort ? "" : ":" + u.Port);
    }

    //  api.example.com, *.example.com (any name under it, not itself), or
    //  host:port to pin one port
    static bool HostAllowed(List<string> hosts, Uri u)
    {
        if (hosts == null) return false;
        string host = u.Host.ToLowerInvariant(), auth = host + ":" + u.Port;
        foreach (string h in hosts)
        {
            if (h.IndexOf(':') >= 0) { if (h == auth) return true; continue; }
            if (h.StartsWith("*.")) { if (host.EndsWith(h.Substring(1)) && host.Length > h.Length - 1) return true; continue; }
            if (h == host) return true;
        }
        return false;
    }

    static string Expand(string tpl, Dictionary<string, Val> vars, List<Val> used, string kind, List<string> masks)
    {
        if (tpl == null) return null;
        return SlotRe.Replace(tpl, delegate(Match m)
        {
            Val v;
            string key = m.Groups[2].Value;
            if (m.Groups[1].Success)
            {
                v = SecretVal(key);
                masks.Add(v.Text);
            }
            else if (!vars.TryGetValue(key, out v))
                throw new CallError("{{" + key + "}} is not an input of this action, or a value an earlier step kept.");
            used.Add(v);
            return Encode(v.Text, kind);
        });
    }

    static Val SecretVal(string name)
    {
        Secret s;
        lock (SecretLock) s = ReadSecrets(true).Find(delegate(Secret x) { return x.Name == name; });
        if (s == null) throw new CallError("There is no secret called " + name + " on this PC. Save it in Menu → Scripts → Secrets.");
        if (s.Value == null) throw new CallError("The secret " + name + " was saved by another Windows user or on another PC, so it cannot be read here. Save it again.");
        Val v = new Val();
        v.Text = s.Value; v.Secret = true; v.Hosts = s.Hosts; v.Label = "the secret " + name;
        return v;
    }

    static string Encode(string text, string kind)
    {
        if (kind == "url" || kind == "form") return Uri.EscapeDataString(text);
        if (kind == "json") { string j = Json(text); return j.Substring(1, j.Length - 2); }
        return text;
    }

    static string Mask(string s, List<string> masks)
    {
        if (s == null || s.Length == 0) return s;
        foreach (string m in masks)
        {
            if (m == null || m.Length < 4) continue;
            s = s.Replace(m, Dots);
            string esc = Uri.EscapeDataString(m);
            if (esc != m) s = s.Replace(esc, Dots);
            string js = Json(m); js = js.Substring(1, js.Length - 2);
            if (js != m) s = s.Replace(js, Dots);
        }
        return s;
    }

    // ── sending one step ────────────────────────────────────────────────────
    static Answer Send(string method, Uri u, Dictionary<string, string> hdrs, string body, string sname, List<string> masks)
    {
        if (!TlsSet)
        {
            // TLS 1.2 by number: the name is not in every framework this compiles against
            try { ServicePointManager.SecurityProtocol = ServicePointManager.SecurityProtocol | (SecurityProtocolType)3072; }
            catch (Exception) { }
            TlsSet = true;
        }
        HttpWebRequest req = (HttpWebRequest)WebRequest.Create(u);
        req.Method = method;
        req.AllowAutoRedirect = false;
        req.Timeout = StepTimeoutMs;
        req.ReadWriteTimeout = StepTimeoutMs;
        req.UserAgent = "Resolv";
        req.Accept = "application/json, */*";
        IWebProxy proxy = WebRequest.DefaultWebProxy;
        if (proxy != null) { proxy.Credentials = CredentialCache.DefaultCredentials; req.Proxy = proxy; }
        foreach (KeyValuePair<string, string> h in hdrs)
        {
            string k = h.Key.Trim().ToLowerInvariant();
            if (k == "content-type") req.ContentType = h.Value;
            else if (k == "accept") req.Accept = h.Value;
            else if (k == "user-agent") req.UserAgent = h.Value;
            else if (k == "host" || k == "content-length" || k == "connection" || k == "transfer-encoding" ||
                     k == "expect" || k == "date" || k == "range" || k == "referer" || k == "if-modified-since" ||
                     k == "proxy-connection" || k == "keep-alive")
                throw new CallError(sname + ": the " + h.Key + " header belongs to the connection and cannot be set.");
            else
            {
                try { req.Headers[h.Key.Trim()] = h.Value; }
                catch (Exception) { throw new CallError(sname + ": the header " + h.Key + " cannot be set this way."); }
            }
        }
        Stopwatch watch = Stopwatch.StartNew();
        HttpWebResponse resp = null;
        try
        {
            if (body != null && method != "GET")
            {
                byte[] data = new UTF8Encoding(false).GetBytes(body);
                if (req.ContentType == null) req.ContentType = "application/json";
                req.ContentLength = data.Length;
                using (Stream s = req.GetRequestStream()) s.Write(data, 0, data.Length);
            }
            try { resp = (HttpWebResponse)req.GetResponse(); }
            catch (WebException e)
            {
                resp = e.Response as HttpWebResponse;
                if (resp == null)
                    throw new CallError(sname + ": " + u.Host + " could not be reached - " +
                                        (e.Status == WebExceptionStatus.Timeout ? "no answer in " + (StepTimeoutMs / 1000) + " seconds" : e.Message) + ".");
            }
        }
        catch (CallError) { throw; }
        catch (Exception e) { throw new CallError(sname + ": " + u.Host + " could not be reached - " + e.Message + "."); }
        using (resp)
        {
            Answer a = new Answer();
            a.Status = (int)resp.StatusCode; a.Reason = resp.StatusDescription; a.Type = resp.ContentType;
            a.Headers = resp.Headers;
            MemoryStream ms = new MemoryStream();
            using (Stream s = resp.GetResponseStream())
            {
                byte[] buf = new byte[65536];
                int n;
                while (s != null && (n = s.Read(buf, 0, buf.Length)) > 0)
                {
                    ms.Write(buf, 0, n);
                    if (ms.Length > MaxAnswerBytes) throw new CallError(sname + ": the answer was larger than 20 MB.");
                }
            }
            a.Bytes = ms.ToArray();
            string cd = resp.Headers["Content-Disposition"];
            if (cd != null)
            {
                Match fm = Regex.Match(cd, "filename\\*?=(?:UTF-8'')?\"?([^\";]+)\"?", RegexOptions.IgnoreCase);
                if (fm.Success) a.FileName = Uri.UnescapeDataString(fm.Groups[1].Value);
            }
            a.Ms = watch.ElapsedMilliseconds;
            return a;
        }
    }

    // ── what a step keeps: a path into its JSON answer ──────────────────────
    //  access_token, document.url, data.items[0].id
    static string Pick(Answer a, string from, ref object parsed, ref bool tried)
    {
        if (from == null || from.Trim().Length == 0) return null;
        from = from.Trim();
        if (!tried)
        {
            tried = true;
            try { parsed = Ser().DeserializeObject(a.Text()); } catch (Exception) { parsed = null; }
        }
        object cur = parsed;
        string path = from.StartsWith("$.") ? from.Substring(2) : from.StartsWith("$") ? from.Substring(1) : from;
        foreach (Match m in Regex.Matches(path, @"([^.\[\]]+)|\[(\d+)\]"))
        {
            if (cur == null) return null;
            if (m.Groups[1].Success)
            {
                Dictionary<string, object> d = cur as Dictionary<string, object>;
                if (d == null) return null;
                object next;
                if (!d.TryGetValue(m.Groups[1].Value, out next))
                {
                    next = null;
                    foreach (KeyValuePair<string, object> kv in d)
                        if (string.Equals(kv.Key, m.Groups[1].Value, StringComparison.OrdinalIgnoreCase)) { next = kv.Value; break; }
                }
                cur = next;
            }
            else
            {
                List<object> l = AsList(cur);
                int i = int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture);
                cur = (cur is System.Collections.IList && i < l.Count) ? l[i] : null;
            }
        }
        if (cur == null) return null;
        if (cur is string) return (string)cur;
        if (cur is bool) return (bool)cur ? "true" : "false";
        if (cur is Dictionary<string, object> || cur is System.Collections.IList) return Ser().Serialize(cur);
        return Convert.ToString(cur, CultureInfo.InvariantCulture);
    }

    // ── your scripts, run from here ─────────────────────────────────────────
    //  POST /run {script, args:[{name, value}], secrets:[names], timeout}
    //
    //  The runner (dossier-runner.bat) still runs what the Run button asks for.
    //  This is for the two things it cannot do: hand a script a secret without
    //  the secret being written anywhere, and say what happened in the same
    //  answer - so the assistant can read the result and carry on.
    //    - Only a .bat or .cmd sitting directly in <workspace>\scripts\, and
    //      none of Resolv's own (dossier-*).
    //    - Every argument is letters, digits, spaces and _ . , : @ / \ = + # ~ -
    //      and nothing cmd.exe or PowerShell reads as syntax: no quotes and no
    //      & | < > ^ % ! $ ' ( ). An argument may have been chosen by the
    //      assistant, and an argument is a value, never a command.
    //    - A script written as a template - {{server}} - is filled in, into a
    //      copy beside it (dossier-run-*) that is deleted when it finishes.
    //    - A secret goes in as an environment variable, RESOLV_SECRET_<NAME>,
    //      and only to a script it was saved for - script:<file> among the
    //      places it may go. It is never written into the copy, and it is
    //      masked out of everything the script prints.
    //    - A script that asks a question gets no answer (its input is closed),
    //      and one still running after its time is stopped, with whatever it
    //      started.
    static readonly Regex ScriptFileRe = new Regex(@"^[A-Za-z0-9][A-Za-z0-9 _.()-]{0,120}\.(bat|cmd)$", RegexOptions.IgnoreCase);
    static readonly Regex ArgNameRe = new Regex(@"^[A-Za-z][\w .-]{0,28}$");
    static readonly Regex ArgValueRe = new Regex(@"^[\p{L}\p{N} _.,:@/\\=+#~-]*$");
    static readonly Regex TemplateRe = new Regex(@"\{\{\s*([A-Za-z][\w .-]{0,28})\s*\}\}");
    const int RunDefaultSeconds = 120, RunMaxSeconds = 280, RunMaxOutput = 1024 * 1024;

    static void RunRoute(NetworkStream net, byte[] body)
    {
        Dictionary<string, object> req = ParseObject(body);
        if (req == null) { Respond(net, 400, "application/json", Bytes("{\"error\":\"send {script, args, secrets}\"}")); return; }
        Respond(net, 200, "application/json", Bytes(Ser().Serialize(RunScript(req))));
    }

    static Dictionary<string, object> RunScript(Dictionary<string, object> req)
    {
        Dictionary<string, object> outp = new Dictionary<string, object>();
        string file = (Str(req, "script") ?? "").Trim();
        outp["script"] = file; outp["ok"] = false; outp["exit"] = -1; outp["output"] = "";
        outp["ms"] = 0L; outp["cut"] = false; outp["filled"] = false; outp["error"] = "";
        List<string> masks = new List<string>();
        string copy = null;
        try
        {
            if (Workspace == null)
                throw new CallError("This bridge was started without your workspace folder, so it does not know where your scripts are. Start Resolv with Resolv.bat.");
            string dir = Path.Combine(Workspace, "scripts");
            if (!Directory.Exists(dir)) throw new CallError("There is no scripts folder in your workspace.");
            if (!ScriptFileRe.IsMatch(file) || file.IndexOf("..") >= 0)
                throw new CallError("\"" + file + "\" is not a script this can run: the name of a .bat or .cmd file in your scripts folder.");
            if (file.StartsWith("dossier-", StringComparison.OrdinalIgnoreCase))
                throw new CallError(file + " is one of Resolv's own scripts, and those are not run from here.");
            string path = Path.Combine(dir, file);
            if (!File.Exists(path)) throw new CallError(file + " is not in your scripts folder.");

            // the arguments, in the order the script takes them
            List<KeyValuePair<string, string>> args = new List<KeyValuePair<string, string>>();
            List<object> given = AsList(req.ContainsKey("args") ? req["args"] : null);
            if (given.Count > 20) throw new CallError("A script takes at most 20 arguments here.");
            foreach (object o in given)
            {
                Dictionary<string, object> a = o as Dictionary<string, object>;
                string n = Str(a, "name") ?? "", v = (Str(a, "value") ?? "").Trim();
                if (!ArgNameRe.IsMatch(n)) throw new CallError("\"" + n + "\" is not a parameter name.");
                if (v.Length > 400) throw new CallError("The value for " + n + " is longer than 400 characters.");
                if (!ArgValueRe.IsMatch(v))
                    throw new CallError("The value for " + n + " has a character a script argument cannot carry safely. " +
                                        "Letters, digits, spaces and _ . , : @ / \\ = + # ~ - only.");
                args.Add(new KeyValuePair<string, string>(n, v));
            }

            // the secrets it was saved for, as environment variables
            Dictionary<string, string> env = new Dictionary<string, string>();
            List<object> wanted = AsList(req.ContainsKey("secrets") ? req["secrets"] : null);
            if (wanted.Count > 10) throw new CallError("A script may be given at most 10 secrets.");
            if (wanted.Count > 0)
            {
                List<Secret> all;
                lock (SecretLock) all = ReadSecrets(true);
                string place = "script:" + file.ToLowerInvariant();
                foreach (object w in wanted)
                {
                    string name = Convert.ToString(w, CultureInfo.InvariantCulture);
                    Secret s = all.Find(delegate(Secret x) { return x.Name == name; });
                    if (s == null)
                        throw new CallError(file + " needs the secret " + name + ", and there is no secret of that name on this PC. Save it in Menu → Scripts → Secrets.");
                    if (s.Value == null)
                        throw new CallError("The secret " + name + " was saved by another Windows user or on another PC, so it cannot be read here. Save it again.");
                    if (s.Hosts.IndexOf(place) < 0)
                        throw new CallError("The secret " + name + " may go to " + string.Join(", ", s.Hosts.ToArray()) + ", not to " + file + ". " +
                                            (file.IndexOf(' ') >= 0 ? "A script with a space in its name cannot be given a secret - rename it first."
                                                                    : "Save it again with " + place + " among the places it may go, if this script should have it."));
                    env["RESOLV_SECRET_" + Regex.Replace(name.ToUpperInvariant(), "[^A-Z0-9]", "_")] = s.Value;
                    masks.Add(s.Value);
                }
            }

            // A template is filled in, into a copy beside it, so that %~dp0
            // still means the scripts folder. Read and written byte for byte
            // (Latin-1 maps every byte to itself), whatever code page it is in.
            string run = path, text = null;
            try { if (new FileInfo(path).Length <= 512 * 1024) text = File.ReadAllText(path, Latin1()); }
            catch (Exception) { text = null; }
            if (text != null && args.Count > 0)
            {
                bool hit = false;
                string filled = TemplateRe.Replace(text, delegate(Match m)
                {
                    string key = m.Groups[1].Value.Trim();
                    foreach (KeyValuePair<string, string> a in args)
                        if (a.Key == key && a.Value.Length > 0) { hit = true; return a.Value; }
                    return m.Value;
                });
                if (hit)
                {
                    copy = Path.Combine(dir, "dossier-run-" + RandomWord(8) + "-" + file);
                    File.WriteAllText(copy, filled, Latin1());
                    run = copy;
                    outp["filled"] = true;
                }
            }

            int secs = RunDefaultSeconds;
            object t;
            if (req.TryGetValue("timeout", out t) && t != null)
            {
                int n;
                if (int.TryParse(Convert.ToString(t, CultureInfo.InvariantCulture), out n)) secs = Math.Max(5, Math.Min(RunMaxSeconds, n));
            }
            RunProcess(run, args, env, dir, secs, outp);
        }
        catch (CallError e) { outp["error"] = e.Message; }
        catch (Exception e) { outp["error"] = "The script could not be started: " + e.Message; }
        finally
        {
            if (copy != null) { try { File.Delete(copy); } catch (Exception) { } }
        }
        masks.Sort(delegate(string a, string b) { return b.Length.CompareTo(a.Length); });
        outp["output"] = Mask(Convert.ToString(outp["output"]), masks);
        outp["error"] = Mask(Convert.ToString(outp["error"]), masks);
        outp["ok"] = Convert.ToString(outp["error"]).Length == 0 && Convert.ToInt32(outp["exit"]) == 0;
        Log("  run       " + (file.Length > 0 ? file : "(no script)") + ((bool)outp["filled"] ? " (filled in)" : "") + ": " +
            (Convert.ToString(outp["error"]).Length > 0 ? Convert.ToString(outp["error"])
                                                       : "exit " + outp["exit"] + " in " + outp["ms"] + " ms"));
        return outp;
    }

    static Encoding Latin1() { return Encoding.GetEncoding(28591); }

    static void RunProcess(string path, List<KeyValuePair<string, string>> args, Dictionary<string, string> env,
                           string dir, int secs, Dictionary<string, object> outp)
    {
        // every argument quoted: none of them can hold a quote of its own
        StringBuilder line = new StringBuilder();
        line.Append('"').Append(path).Append('"');
        foreach (KeyValuePair<string, string> a in args) line.Append(" \"").Append(a.Value).Append('"');
        bool windows = Path.DirectorySeparatorChar == '\\';
        string shell = Environment.GetEnvironmentVariable("DOSSIER_SHELL");      // for the tests, off Windows
        ProcessStartInfo psi;
        if (shell != null && shell.Length > 0) psi = new ProcessStartInfo(shell, line.ToString());
        else if (windows) psi = new ProcessStartInfo("cmd.exe", "/d /s /c \"" + line + "\"");
        else psi = new ProcessStartInfo("/bin/sh", line.ToString());
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.WindowStyle = ProcessWindowStyle.Hidden;
        psi.RedirectStandardInput = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.WorkingDirectory = dir;
        if (windows)
        {
            // what cmd.exe prints is in the console's code page, not the ANSI one
            try
            {
                Encoding oem = Encoding.GetEncoding(CultureInfo.CurrentCulture.TextInfo.OEMCodePage);
                psi.StandardOutputEncoding = oem; psi.StandardErrorEncoding = oem;
            }
            catch (Exception) { }
        }
        psi.EnvironmentVariables["DOSSIER_SCRIPTS"] = dir;
        foreach (KeyValuePair<string, string> e in env) psi.EnvironmentVariables[e.Key] = e.Value;

        StringBuilder buf = new StringBuilder();
        object bufLock = new object();
        bool cut = false;
        DataReceivedEventHandler take = delegate(object sender, DataReceivedEventArgs e)
        {
            if (e.Data == null) return;
            lock (bufLock)
            {
                if (buf.Length + e.Data.Length + 1 > RunMaxOutput) { cut = true; return; }
                buf.Append(e.Data).Append('\n');
            }
        };
        Stopwatch watch = Stopwatch.StartNew();
        using (Process p = new Process())
        {
            p.StartInfo = psi;
            p.OutputDataReceived += take;
            p.ErrorDataReceived += take;
            p.Start();
            try { p.StandardInput.Close(); } catch (Exception) { }
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
            bool done = p.WaitForExit(secs * 1000);
            if (!done)
            {
                KillTree(p);
                outp["error"] = "It was still running after " + secs + " seconds, so it was stopped.";
            }
            // the last of the output, once the pipes close - not forever,
            // because something the script started may be holding them open
            Process waitFor = p;
            Thread flush = new Thread(delegate() { try { waitFor.WaitForExit(); } catch (Exception) { } });
            flush.IsBackground = true;
            flush.Start();
            flush.Join(5000);
            int code = -1;
            try { if (done) code = p.ExitCode; } catch (Exception) { }
            outp["exit"] = code;
        }
        outp["ms"] = watch.ElapsedMilliseconds;
        lock (bufLock) { outp["output"] = buf.ToString(); outp["cut"] = cut; }
    }

    static void KillTree(Process p)
    {
        try
        {
            if (Path.DirectorySeparatorChar == '\\')
            {
                ProcessStartInfo kill = new ProcessStartInfo("taskkill", "/PID " + p.Id + " /T /F");
                kill.UseShellExecute = false;
                kill.CreateNoWindow = true;
                Process.Start(kill).WaitForExit(5000);
            }
            else p.Kill();
        }
        catch (Exception) { try { p.Kill(); } catch (Exception) { } }
    }

    // ── kept values ─────────────────────────────────────────────────────────
    static string Keep(string name, string value, List<string> hosts)
    {
        string handle = "@kept:" + RandomWord(20);
        Kept k = new Kept();
        k.Name = name; k.Value = value; k.Hosts = hosts; k.Expires = DateTime.UtcNow.AddMinutes(KeptMinutes);
        lock (KeptLock) { PurgeKept(); KeptValues[handle] = k; }
        return handle;
    }

    //  n letters of a-z and 2-7, from the cryptographic generator: 32 symbols,
    //  so a byte modulo 32 is not biased
    static string RandomWord(int n)
    {
        byte[] r = new byte[n];
        using (RandomNumberGenerator rng = RandomNumberGenerator.Create()) rng.GetBytes(r);
        const string abc = "abcdefghijklmnopqrstuvwxyz234567";
        StringBuilder b = new StringBuilder();
        foreach (byte x in r) b.Append(abc[x % 32]);
        return b.ToString();
    }

    static Kept FindKept(string handle)
    {
        lock (KeptLock)
        {
            PurgeKept();
            Kept k;
            return KeptValues.TryGetValue(handle, out k) ? k : null;
        }
    }

    static void PurgeKept()
    {
        List<string> gone = new List<string>();
        foreach (KeyValuePair<string, Kept> kv in KeptValues) if (kv.Value.Expires < DateTime.UtcNow) gone.Add(kv.Key);
        foreach (string g in gone) KeptValues.Remove(g);
    }

    // ── JSON ────────────────────────────────────────────────────────────────
    static JavaScriptSerializer Ser()
    {
        JavaScriptSerializer s = new JavaScriptSerializer();
        s.MaxJsonLength = int.MaxValue;
        s.RecursionLimit = 64;
        return s;
    }

    static Dictionary<string, object> ParseObject(byte[] body)
    {
        if (body == null || body.Length == 0) return null;
        try { return Ser().DeserializeObject(new UTF8Encoding(false).GetString(body)) as Dictionary<string, object>; }
        catch (Exception) { return null; }
    }

    static string Str(Dictionary<string, object> d, string k)
    {
        object v;
        if (d != null && d.TryGetValue(k, out v) && v != null && !(v is Dictionary<string, object>) && !(v is System.Collections.IList))
            return Convert.ToString(v, CultureInfo.InvariantCulture);
        return null;
    }

    static bool Bool(Dictionary<string, object> d, string k)
    {
        object v;
        return d != null && d.TryGetValue(k, out v) && v is bool && (bool)v;
    }

    static Dictionary<string, object> Obj(Dictionary<string, object> d, string k)
    {
        object v;
        if (d != null && d.TryGetValue(k, out v) && v is Dictionary<string, object>) return (Dictionary<string, object>)v;
        return new Dictionary<string, object>();
    }

    static List<object> AsList(object v)
    {
        List<object> l = new List<object>();
        System.Collections.IList il = v as System.Collections.IList;
        if (il != null) foreach (object x in il) l.Add(x);
        return l;
    }
}
