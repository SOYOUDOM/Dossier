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
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

public class DossierBridge
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
        Log("  Dossier   " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));

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
        if (AppRoot != null) Log("  Dossier   " + Url());
        if (Port != Wanted && AppRoot != null)
        {
            Log("  Port " + Wanted + " was taken, so this is on " + Port + ". A browser counts that as a");
            Log("  different address, so Dossier will ask for your workspace folder once more.");
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
            try { MessageBox.Show(message, "Dossier", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
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
                "Pick the same folder you pick in Dossier - the one with your dossier.json in it. " +
                "It is remembered, so this is asked once.\n\n" +
                "It is used to run your scripts in the background. Cancel if you do not use scripts; " +
                "Dossier works without it.",
                "Dossier", MessageBoxButtons.OK, MessageBoxIcon.Information);
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
            Fail("That folder is the Dossier program, not a folder of records:\n\n    " + Workspace +
                 "\n\nKeep your records in a folder of their own - Documents\\Dossier will do - " +
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
            Log("    Dossier will keep its records in dossier.json until this is fixed.");
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
        ToolStripItem open = menu.Items.Add("Open Dossier", null, delegate { OpenBrowser(Port); });
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
        menu.Items.Add("Quit Dossier", null, delegate
        {
            Tray.Visible = false;
            Application.Exit();
        });
        Tray.ContextMenuStrip = menu;
        Tray.DoubleClick += delegate { OpenBrowser(Port); };
        Tray.Text = "Dossier - starting the database";
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
                Tray.ShowBalloonTip(8000, "Dossier - no database",
                    "Records stay in dossier.json. Show log says why.", ToolTipIcon.Warning);
            else if (Quiet)
                Tray.ShowBalloonTip(4000, "Dossier is running", "Double-click this icon to open it.", ToolTipIcon.Info);
        };
        settle.Start();

        Application.Run();
        Tray.Visible = false;
        Tray.Dispose();
    }

    static string TrayText()
    {
        string t = "Dossier - 127.0.0.1:" + Port + (DbOk ? " - SQL Server" : " - no database");
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
        LogForm.Text = "Dossier - log";
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
                bool api = (path == "/health" || path == "/workspace" || path == "/attachment" || path == "/history");
                if (!api)
                {
                    if ((method == "GET" || method == "HEAD") && Static(net, path, method == "HEAD")) return;
                    Respond(net, 404, "text/plain", Bytes("Dossier is at /dossier.html"));
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
            h.Append("Access-Control-Allow-Headers: content-type, x-dossier-token, x-dossier-confirm, x-dossier-reason, x-name, x-type, x-record\r\n");
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
            Respond(net, 200, "application/json",
                    Bytes("{\"ok\":true,\"records\":" + (recs == null ? "0" : recs.ToString()) + "}"));
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
