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
//    - carries out the steps of your automations (5.22): the API calls and
//      scripts KalKech's Automations panel designs, with the secrets they
//      need kept here, encrypted, where the page cannot read them back.
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
using System.Windows.Forms;
using Microsoft.Win32;

public class DossierBridge
{
    static string Token;
    static string ConnectionString;
    static string Database = "Dossier";
    const string DefaultServer = @"(localdb)\MSSQLLocalDB";
    static string Server = DefaultServer;
    //  where Server came from: "default", "setup" (chosen in KalKech's
    //  Setup, kept in the registry), "DOSSIER_SQL" or "command line"
    static string ServerFrom = "default";
    //  moves on every change of server, so a save that was already queued
    //  for the old one is not written into the new one
    static volatile int ServerGen;
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
        if (pos.Count > 1 && pos[1].Length > 0) { Server = pos[1]; ServerFrom = "command line"; }
        if (pos.Count > 2 && pos[2].Length > 0) Database = pos[2];
        if (pos.Count > 3 && pos[3].Length > 0) AppRoot = pos[3];

        string env = Environment.GetEnvironmentVariable("DOSSIER_SQL");
        //  an empty argument is no argument: it does not hide the variable
        if (env != null && env.Length > 0 && ServerFrom == "default") { Server = env; ServerFrom = "DOSSIER_SQL"; }
        //  Not every PC has LocalDB, or calls its server the same thing:
        //  SQL Express is ".\SQLEXPRESS", a full install is the PC's own name.
        //  The name typed into Setup is kept per Windows user, so a second
        //  clone on the same PC finds it too. The two above still win - they
        //  are someone saying so on purpose, for this one start.
        if (ServerFrom == "default")
        {
            string saved = SavedServer();
            if (saved != null) { Server = saved; ServerFrom = "setup"; }
        }
        env = Environment.GetEnvironmentVariable("DOSSIER_DB");
        if (env != null && env.Length > 0 && (pos.Count < 3 || pos[2].Length == 0)) Database = env;
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
        Log("  KalKech   " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));

        ChooseWorkspace();

        ConnectionString = ConnFor(Server);

        Token = Guid.NewGuid().ToString("N");
        TcpListener listener = Bind(AppRoot == null ? 0 : Wanted, out Port);
        try { File.WriteAllText(Path.Combine(Here, ".port"), Port.ToString()); } catch (Exception) { }

        // written now, saying "starting", so a page opened from file:// in
        // the next few seconds waits for the database instead of deciding
        // there is none; written again when the database is settled
        WriteHandshake();

        Log("  workspace " + (Workspace ?? "(not chosen - scripts will not run by themselves)"));
        Log("  listening 127.0.0.1:" + Port);
        if (AppRoot != null) Log("  KalKech   " + Url());
        if (Port != Wanted && AppRoot != null)
        {
            Log("  Port " + Wanted + " was taken, so this is on " + Port + ". A browser counts that as a");
            Log("  different address, so KalKech will ask for your workspace folder once more.");
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
            //  DOSSIER_NODB=1: no database at all - for the automation tests,
            //  which must not create one on a PC that has LocalDB
            if (Environment.GetEnvironmentVariable("DOSSIER_NODB") == "1") { DbOk = false; DbError = "switched off (DOSSIER_NODB)"; }
            else Migrate();
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
            try { MessageBox.Show(message, "KalKech", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
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
                "Pick the same folder you pick in KalKech - the one with your dossier.json in it. " +
                "It is remembered, so this is asked once.\n\n" +
                "It is used to run your scripts in the background. Cancel if you do not use scripts; " +
                "KalKech works without it.",
                "KalKech", MessageBoxButtons.OK, MessageBoxIcon.Information);
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
            Fail("That folder is the KalKech program, not a folder of records:\n\n    " + Workspace +
                 "\n\nKeep your records in a folder of their own - Documents\\KalKech will do - " +
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
            Log("    KalKech will keep its records in dossier.json until this is fixed.");
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
        if (Environment.GetEnvironmentVariable("DOSSIER_NORUNNER") == "1") return;
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
        ToolStripItem open = menu.Items.Add("Open KalKech", null, delegate { OpenBrowser(Port); });
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
        menu.Items.Add("Quit KalKech", null, delegate
        {
            Tray.Visible = false;
            Application.Exit();
        });
        Tray.ContextMenuStrip = menu;
        Tray.DoubleClick += delegate { OpenBrowser(Port); };
        Tray.Text = "KalKech - starting the database";
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
                Tray.ShowBalloonTip(8000, "KalKech - no database",
                    "Records stay in dossier.json. Show log says why.", ToolTipIcon.Warning);
            else if (Quiet)
                Tray.ShowBalloonTip(4000, "KalKech is running", "Double-click this icon to open it.", ToolTipIcon.Info);
        };
        settle.Start();

        Application.Run();
        Tray.Visible = false;
        Tray.Dispose();
    }

    static string TrayText()
    {
        string t = "KalKech - 127.0.0.1:" + Port + (DbOk ? " - SQL Server" : " - no database");
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
        LogForm.Text = "KalKech - log";
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
                            path == "/sqlserver" || path == "/secrets" || path.StartsWith("/auto/"));
                if (!api)
                {
                    if ((method == "GET" || method == "HEAD") && Static(net, path, method == "HEAD")) return;
                    Respond(net, 404, "text/plain", Bytes("KalKech is at /dossier.html"));
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
                    //  which SQL Server: asked and changed from Setup, and it
                    //  has to work most of all when the database does not
                    if (path == "/sqlserver") { SqlServerRoute(net, method, query); return; }
                    //  automations (5.22) need no database: an API call, a
                    //  script, and the secrets they use
                    if (path == "/secrets") { SecretsRoute(net, method, query, body); return; }
                    if (path.StartsWith("/auto/")) { AutoRoute(net, method, path, body); return; }
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
        if (s == 405) return "Method Not Allowed";
        if (s == 413) return "Payload Too Large";
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
        int gen = ServerGen;
        lock (SaveLock)
        {
        long waited = clock.ElapsedMilliseconds;
        if (gen != ServerGen || !DbOk)
        {
            Respond(net, 503, "application/json",
                    Bytes("{\"error\":\"the SQL Server was changed while this save waited - it will be sent again\"}"));
            return;
        }
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

    // ── which SQL Server ────────────────────────────────────────────────────
    //  The name is the one SSMS asks for in its Connect window: "Server name".
    //  It goes into a connection string, so it may be a name and nothing
    //  else - no ";" or "=" that could add a setting of its own.
    public static bool ServerNameOk(string s)
    {
        return s != null && Regex.IsMatch(s, @"^[A-Za-z0-9_.,:\\()\-]{1,128}$");
    }

    static string ConnFor(string server)
    {
        return "Server=" + server + ";Database=" + Database +
               ";Integrated Security=true;MultipleActiveResultSets=true;" +
               "Connect Timeout=60;Application Name=DossierBridge";
    }

    const string OwnKey = @"Software\KalKech";

    static string SavedServer()
    {
        try
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(OwnKey))
            {
                string v = k == null ? null : k.GetValue("SqlServer") as string;
                if (v == null || v.Trim().Length == 0) return null;
                v = v.Trim();
                if (ServerNameOk(v)) return v;
                Log("  ! the SQL Server name saved in Setup has characters a server name cannot have - using the default");
                return null;
            }
        }
        catch (Exception) { return null; }
    }

    //  the default is not saved: forgetting the choice is what goes back to it
    static void SaveServer(string v)
    {
        using (RegistryKey k = Registry.CurrentUser.CreateSubKey(OwnKey))
        {
            if (v == null || string.Equals(v, DefaultServer, StringComparison.OrdinalIgnoreCase))
                k.DeleteValue("SqlServer", false);
            else k.SetValue("SqlServer", v, RegistryValueKind.String);
        }
    }

    //  GET  /sqlserver                  what is in use, and where it came from
    //  POST /sqlserver?name=..&apply=0  can that server be reached? what is on it?
    //  POST /sqlserver?name=..&apply=1  use it: tables made, your workspace and
    //                                   its attachments copied over, then kept
    //  An empty name means the default, (localdb)\MSSQLLocalDB.
    static void SqlServerRoute(NetworkStream net, string method, string query)
    {
        bool locked = ServerFrom == "DOSSIER_SQL" || ServerFrom == "command line";
        if (method == "GET")
        {
            Respond(net, 200, "application/json", Bytes(
                "{\"server\":" + Json(Server) + ",\"from\":" + Json(ServerFrom) +
                ",\"locked\":" + (locked ? "true" : "false") +
                ",\"default\":" + Json(DefaultServer) + ",\"database\":" + Json(Database) +
                ",\"db\":" + (DbOk ? "true" : "false") + ",\"starting\":" + (DbReady ? "false" : "true") +
                ",\"error\":" + Json(DbOk ? "" : DbError) + "}"));
            return;
        }
        if (method != "POST") { Respond(net, 405, "application/json", Bytes("{\"error\":\"GET or POST\"}")); return; }

        string name = QueryValue(query, "name").Trim();
        if (name.Length == 0) name = DefaultServer;
        if (!ServerNameOk(name))
        {
            Respond(net, 400, "application/json", Bytes("{\"ok\":false,\"error\":" +
                Json("That is not a server name. Use the name SSMS shows, like (localdb)\\MSSQLLocalDB, .\\SQLEXPRESS or YOURPC\\SQLEXPRESS.") + "}"));
            return;
        }

        bool apply = QueryValue(query, "apply") == "1";
        if (apply && locked)
        {
            Respond(net, 409, "application/json", Bytes("{\"ok\":false,\"locked\":true,\"error\":" +
                Json("KalKech was started with the server set by " + ServerFrom + ", which wins over Setup. Change it there, or start KalKech without it.") + "}"));
            return;
        }
        string version, edition, wsId;
        bool hasDb;
        int records;
        string err = TestServer(name, out version, out edition, out hasDb, out records, out wsId);
        if (err != null)
        {
            Respond(net, 200, "application/json", Bytes("{\"ok\":false,\"error\":" + Json(err) + "}"));
            return;
        }
        string found = ",\"version\":" + Json(version) + ",\"edition\":" + Json(edition) +
                       ",\"hasDb\":" + (hasDb ? "true" : "false") + ",\"records\":" + records +
                       ",\"wsId\":" + Json(wsId);
        if (!apply)
        {
            Respond(net, 200, "application/json", Bytes("{\"ok\":true" + found + "}"));
            return;
        }
        if (!DbReady)
        {
            Respond(net, 503, "application/json", Bytes("{\"ok\":false,\"error\":\"the database is still starting - try again in a moment\"}"));
            return;
        }

        string note = "";
        bool copiedDoc = false;
        int copiedFiles = 0;
        lock (SaveLock)
        {
            string oldServer = Server, oldConn = ConnectionString, oldErr = DbError;
            bool oldOk = DbOk, oldHist = HasHistory;
            DbReady = false;
            ServerGen++;
            try
            {
                Log("  sql       switching to " + name);
                Server = name;
                ConnectionString = ConnFor(name);
                Migrate();
                if (!DbOk)
                {
                    string why = DbError;
                    Server = oldServer; ConnectionString = oldConn; DbOk = oldOk; DbError = oldErr; HasHistory = oldHist;
                    Log("  sql       stayed on " + oldServer + " - " + why);
                    Respond(net, 200, "application/json", Bytes("{\"ok\":false,\"error\":" +
                        Json("Reached, but KalKech could not make its tables there: " + why) + "}"));
                    return;
                }
                if (oldOk && !string.Equals(oldServer, name, StringComparison.OrdinalIgnoreCase))
                {
                    try { note = CarryOver(oldConn, out copiedDoc, out copiedFiles); }
                    catch (Exception e)
                    {
                        //  nothing is lost: the old server still has it all,
                        //  and the page brings dossier.json in if it must
                        note = "copying from the old server stopped: " + e.Message;
                        Log("  ! " + note);
                    }
                }
                try { SaveServer(name); }
                catch (Exception e)
                {
                    //  in use now, but the next start goes back to the old name
                    string why = "the choice could not be kept for the next start: " + e.Message;
                    note = note.Length > 0 ? note + "; " + why : why;
                    Log("  ! " + why);
                }
                ServerFrom =string.Equals(name, DefaultServer, StringComparison.OrdinalIgnoreCase) ? "default" : "setup";
                Log("  sql       now " + Database + " on " + Server +
                    (copiedDoc ? " - workspace copied" : "") + (copiedFiles > 0 ? ", " + copiedFiles + " attachment(s) copied" : ""));
            }
            finally
            {
                DbReady = true;
                WriteHandshake();
                if (Tray != null) { try { Tray.Text = TrayText(); } catch (Exception) { } }
            }
        }
        Respond(net, 200, "application/json", Bytes("{\"ok\":true,\"switched\":true,\"server\":" + Json(Server) +
            found + ",\"copied\":" + (copiedDoc ? "true" : "false") + ",\"files\":" + copiedFiles +
            ",\"note\":" + Json(note) + "}"));
    }

    //  Can it be reached, and what does it hold? Read-only: nothing is made.
    static string TestServer(string name, out string version, out string edition, out bool hasDb,
                             out int records, out string wsId)
    {
        version = ""; edition = ""; hasDb = false; records = 0; wsId = "";
        try
        {
            using (SqlConnection c = new SqlConnection("Server=" + name + ";Database=master;Integrated Security=true;" +
                                                       "Connect Timeout=30;Application Name=DossierBridge"))
            {
                c.Open();
                using (SqlCommand cmd = new SqlCommand(
                    "SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(60)), " +
                    "CAST(SERVERPROPERTY('Edition') AS nvarchar(120)), DB_ID(@db)", c))
                {
                    cmd.Parameters.Add("@db", SqlDbType.NVarChar, 128).Value = Database;
                    using (SqlDataReader r = cmd.ExecuteReader())
                    {
                        if (r.Read())
                        {
                            version = r.IsDBNull(0) ? "" : r.GetString(0);
                            edition = r.IsDBNull(1) ? "" : r.GetString(1);
                            hasDb = !r.IsDBNull(2);
                        }
                    }
                }
                if (hasDb)
                {
                    //  Database is checked as a plain name at start, so it can
                    //  stand inside [ ] here. Reached but not let in (made by
                    //  another Windows user) is still reached: Use says the rest.
                    try
                    {
                        using (SqlCommand cmd = new SqlCommand(
                            "IF OBJECT_ID(N'[" + Database + "].dbo.Workspace') IS NOT NULL " +
                            "SELECT ISNULL(Records, 0), LEFT(Doc, 2000) FROM [" + Database + "].dbo.Workspace WHERE Id = 1", c))
                        using (SqlDataReader r = cmd.ExecuteReader())
                        {
                            if (r.Read())
                            {
                                records = r.IsDBNull(0) ? 0 : Convert.ToInt32(r.GetValue(0));
                                wsId = WsId(r.IsDBNull(1) ? "" : r.GetString(1));
                            }
                        }
                    }
                    catch (SqlException) { }
                }
            }
            return null;
        }
        catch (Exception e) { return e.Message; }
    }

    static string WsId(string doc)
    {
        if (doc == null) return "";
        Match m = Regex.Match(doc.Length > 2000 ? doc.Substring(0, 2000) : doc, "\"wsId\"\\s*:\\s*\"([^\"]*)\"");
        return m.Success ? m.Groups[1].Value : "";
    }

    //  Moving to another server must not leave the work behind on the old one.
    //  With the bridge on, a record's attachments are rows in the database and
    //  nowhere else, so the workspace AND its attachments come across:
    //    - the new database empty: the workspace is loaded into it, the same
    //      way a save loads it, and every attachment copied;
    //    - the same workspace already there: only the attachments it lacks;
    //    - another workspace there: nothing - the page sees that and asks.
    //  The old server keeps everything it had, history included.
    static string CarryOver(string oldConn, out bool copiedDoc, out int copiedFiles)
    {
        copiedDoc = false; copiedFiles = 0;
        using (SqlConnection from = new SqlConnection(oldConn))
        using (SqlConnection to = Open())
        {
            from.Open();
            string fromDoc = Scalar(from, "SELECT Doc FROM dbo.Workspace WHERE Id = 1") as string;
            if (fromDoc == null) return "";
            string toDoc = Scalar(to, "SELECT Doc FROM dbo.Workspace WHERE Id = 1") as string;
            string fromId = WsId(fromDoc);
            if (toDoc != null)
            {
                string toId = WsId(toDoc);
                if (fromId.Length == 0 || toId != fromId)
                    return "the new server already holds a different workspace - nothing was copied";
            }
            else
            {
                using (SqlTransaction tx = to.BeginTransaction())
                {
                    try
                    {
                        using (SqlCommand cmd = new SqlCommand("dbo.LoadWorkspace", to, tx))
                        {
                            cmd.CommandType = CommandType.StoredProcedure;
                            cmd.CommandTimeout = 300;
                            cmd.Parameters.Add("@doc", SqlDbType.NVarChar, -1).Value = fromDoc;
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
                copiedDoc = true;
            }

            if (Scalar(from, "SELECT OBJECT_ID('dbo.Attachment', 'U')") == null) return "";
            using (SqlCommand read = new SqlCommand(
                "SELECT AttachmentId, RecordId, Name, Type, Bytes, Added, Content FROM dbo.Attachment", from))
            {
                read.CommandTimeout = 600;
                using (SqlDataReader r = read.ExecuteReader())
                {
                    while (r.Read())
                    {
                        using (SqlCommand put = new SqlCommand(
                            "IF NOT EXISTS (SELECT 1 FROM dbo.Attachment WHERE AttachmentId = @id) " +
                            "INSERT dbo.Attachment (AttachmentId, RecordId, Name, Type, Bytes, Added, Content) " +
                            "VALUES (@id, @rec, @name, @type, @bytes, @added, @content)", to))
                        {
                            put.CommandTimeout = 300;
                            put.Parameters.Add("@id", SqlDbType.NVarChar, 40).Value = r.GetValue(0);
                            put.Parameters.Add("@rec", SqlDbType.NVarChar, 40).Value = r.GetValue(1);
                            put.Parameters.Add("@name", SqlDbType.NVarChar, 400).Value = r.GetValue(2);
                            put.Parameters.Add("@type", SqlDbType.NVarChar, 160).Value = r.GetValue(3);
                            put.Parameters.Add("@bytes", SqlDbType.Int).Value = r.GetValue(4);
                            put.Parameters.Add("@added", SqlDbType.DateTime2).Value = r.GetValue(5);
                            put.Parameters.Add("@content", SqlDbType.VarBinary, -1).Value = r.GetValue(6);
                            if (put.ExecuteNonQuery() > 0) copiedFiles++;
                        }
                    }
                }
            }
        }
        return "";
    }

    // ── automations: API calls and scripts, one step at a time (5.22) ───────
    //  The page designs the job and walks it, step by step; each step comes
    //  here, because a page in a browser can neither call a company API (its
    //  own rules allow it to talk to this program and nothing else) nor start
    //  a script. So this is where a request is made, and where the secrets
    //  are - which is the point:
    //
    //    - A SECRET (a password, an API key) is typed into the page once and
    //      sent here, write-only. It is kept encrypted for this Windows user
    //      (DPAPI) in %LOCALAPPDATA%\KalKech\secrets.dat, bound to its
    //      connection AND to that connection's address when it was saved: a
    //      connection whose address has changed since does not get it, so a
    //      design that was altered - by hand, by an import - cannot send it
    //      anywhere new. No route returns one.
    //    - A value a step saves as HIDDEN (a sign-in token) stays in this
    //      process, under its run, and is gone when the run ends or after
    //      thirty minutes. The page is told only its name.
    //    - Everything that goes back - the reply's text, an error, the
    //      address - has every secret and hidden value of the run taken out
    //      first, with the forms they travel in (base64, %-escaped), and
    //      anything shaped like a token or a password field besides.
    //
    //  Placeholders - {{input.policy}}, {{token}}, {{secret.password}} - are
    //  filled in here, once, each escaped for where it lands (a path, a JSON
    //  string, XML), so a value cannot rewrite the request around it and a
    //  value that contains "{{secret.password}}" stays text. The address that
    //  comes out must still be under the connection's own address, a header
    //  cannot hold a line break, and redirects are not followed.
    //
    //  A script step runs a .bat or .cmd from the workspace's own scripts\
    //  folder, nothing else, with its values as arguments and as KK_ variables;
    //  a value with a character cmd.exe would act on (& | < > ^ % ! " ( ))
    //  is refused rather than passed.
    //
    //  The conditions ("only when", "repeat until") are read by a small reader
    //  of their own, the same as the page's (automations.js): the two are
    //  checked against one list of cases (tests/fixtures/auto-conditions.json).

    static readonly object AutoLock = new object();
    static readonly Dictionary<string, AutoRun> AutoRuns = new Dictionary<string, AutoRun>();
    static readonly object SecretLock = new object();
    static readonly byte[] SecretEntropy = Encoding.UTF8.GetBytes("KalKech secret 1");
    const string Dots = "\u2022\u2022\u2022\u2022";
    const int AutoBodyMax = 4 * 1024 * 1024;     // the most of a reply that is read
    const int AutoValueMax = 4000;               // a value shown to you or the assistant
    static bool TlsSet;

    class AutoRun
    {
        public Dictionary<string, string> Hidden = new Dictionary<string, string>();
        //  what must never go back to the page: every secret used, every
        //  hidden value, the values typed as secret - and their encodings
        public List<string> Known = new List<string>();
        public DateTime Last = DateTime.UtcNow;
    }

    static bool IsWindows { get { return Environment.OSVersion.Platform == PlatformID.Win32NT; } }

    static void AutoRoute(NetworkStream net, string method, string path, byte[] body)
    {
        if (path == "/auto/info")
        {
            string ws = Workspace == null ? "" : Path.GetFileName(Workspace);
            bool scripts = Workspace != null && Directory.Exists(Path.Combine(Workspace, "scripts"));
            Respond(net, 200, "application/json", Bytes(new JOut().B("ok", true).N("version", 1)
                .S("workspace", ws).B("scripts", scripts).B("windows", IsWindows).S("user", Environment.UserName).ToString()));
            return;
        }
        if (method != "POST") { Respond(net, 405, "application/json", Bytes("{\"error\":\"POST only\"}")); return; }
        if (body.Length > 1024 * 1024) { Respond(net, 413, "application/json", Bytes("{\"error\":\"too big\"}")); return; }
        JObj req;
        try { req = JsonReader.Parse(Encoding.UTF8.GetString(body)) as JObj; }
        catch (Exception e) { Respond(net, 400, "application/json", Bytes("{\"error\":" + Json("not JSON: " + e.Message) + "}")); return; }
        if (req == null) { Respond(net, 400, "application/json", Bytes("{\"error\":\"not an object\"}")); return; }
        string runId = JS(req, "run");
        if (!Regex.IsMatch(runId, "^[A-Za-z0-9_-]{4,64}$"))
        {
            Respond(net, 400, "application/json", Bytes("{\"error\":\"no run id\"}"));
            return;
        }
        string op = path.Substring("/auto/".Length);
        if (op == "end")
        {
            lock (AutoLock) { AutoRuns.Remove(runId); }
            Respond(net, 200, "application/json", Bytes("{\"ok\":true}"));
            return;
        }
        if (op != "step" && op != "check") { Respond(net, 404, "application/json", Bytes("{\"error\":\"no such route\"}")); return; }

        AutoRun run = RunFor(runId);
        StepCtx c = new StepCtx(req, run);
        string answer;
        try
        {
            if (op == "check")
            {
                bool result;
                string err = CondEval(JS(req, "when"), c, null, out result);
                answer = err != null ? Failed(err, c) : new JOut().B("ok", true).B("result", result).ToString();
            }
            else
            {
                string when = JS(req, "when");
                bool go = true;
                string err = when.Length > 0 ? CondEval(when, c, null, out go) : null;
                JObj step = JO(req, "step") ?? new JObj();
                string kind = JS(req, "kind");
                if (err != null) answer = Failed("its \"only when\": " + err, c);
                else if (!go) answer = new JOut().B("ok", true).B("skipped", true).ToString();
                else if (kind == "http") answer = DoHttp(c, step, JS(req, "until"), JB(req, "test"));
                else if (kind == "script") answer = DoScript(c, step, JS(req, "until"), JB(req, "test"));
                else answer = Failed("a step of kind \"" + kind + "\" is not one this program runs", c);
            }
        }
        catch (Exception e)
        {
            Log("  ! automation " + runId + ": " + e.Message);
            answer = Failed(e.Message, c);
        }
        lock (run) { run.Last = DateTime.UtcNow; }
        Respond(net, 200, "application/json", Bytes(answer));
    }

    //  this run's place for hidden values; runs left over by a closed page
    //  are let go after half an hour
    static AutoRun RunFor(string id)
    {
        lock (AutoLock)
        {
            DateTime old = DateTime.UtcNow.AddMinutes(-30);
            List<string> gone = new List<string>();
            foreach (KeyValuePair<string, AutoRun> kv in AutoRuns) if (kv.Value.Last < old) gone.Add(kv.Key);
            foreach (string k in gone) AutoRuns.Remove(k);
            AutoRun r;
            if (!AutoRuns.TryGetValue(id, out r))
            {
                if (AutoRuns.Count >= 50)
                {
                    string oldest = null;
                    foreach (KeyValuePair<string, AutoRun> kv in AutoRuns)
                        if (oldest == null || kv.Value.Last < AutoRuns[oldest].Last) oldest = kv.Key;
                    if (oldest != null) AutoRuns.Remove(oldest);
                }
                r = new AutoRun();
                AutoRuns[id] = r;
            }
            r.Last = DateTime.UtcNow;
            return r;
        }
    }

    //  one step's view of the world: the values the page sent (inputs, the
    //  built-ins, the values shown so far), this run's hidden ones, and the
    //  step's connection - whose secrets, and only whose, it may use
    class StepCtx
    {
        public AutoRun Run;
        public Dictionary<string, string> Values = new Dictionary<string, string>();
        public JObj Conn;
        public string ConnId = "", ConnName = "", ConnBase = "";
        public List<string> ConnSecrets = new List<string>();
        public List<string> Errors = new List<string>();
        public StepCtx(JObj req, AutoRun run)
        {
            Run = run;
            JObj v = JO(req, "values");
            if (v != null) foreach (string k in v.Keys) if (k.Length <= 80) Values[k] = TextOf(v.Get(k));
            foreach (object m in JA(req, "mask"))
            {
                string val;
                if (m is string && Values.TryGetValue((string)m, out val)) AddKnown(run, val);
            }
            Conn = JO(req, "conn");
            if (Conn != null)
            {
                ConnId = JS(Conn, "id");
                ConnName = JS(Conn, "name");
                if (ConnName.Length == 0) ConnName = "this connection";
                ConnBase = JS(Conn, "base");
                foreach (object s in JA(Conn, "secrets")) if (s is string) ConnSecrets.Add((string)s);
                if (!Regex.IsMatch(ConnId, "^[A-Za-z0-9_-]{1,40}$")) { Conn = null; ConnId = ""; }
            }
        }
    }

    static string Failed(string error, StepCtx c)
    {
        return new JOut().B("ok", false).S("error", c == null ? error : Redact(error, c.Run)).ToString();
    }

    static void AddKnown(AutoRun run, string v)
    {
        if (v == null || v.Length < 4) return;
        lock (run)
        {
            List<string> forms = new List<string>();
            forms.Add(v);
            forms.Add(Convert.ToBase64String(Encoding.UTF8.GetBytes(v)));
            try { forms.Add(Uri.EscapeDataString(v)); } catch (Exception) { }
            string j = Json(v);
            forms.Add(j.Substring(1, j.Length - 2));
            foreach (string f in forms) if (f.Length >= 4 && !run.Known.Contains(f)) run.Known.Add(f);
        }
    }

    //  ── filling in placeholders ────────────────────────────────────────────
    static readonly Regex PhRe = new Regex(@"\{\{([^{}]*)\}\}");

    class Ph
    {
        public string Ns = "", Name = "", Full = "", Raw = "", Bad = "";
        public List<string> Filters = new List<string>();
    }
    static readonly string[] PhFilters = { "upper", "lower", "trim", "base64", "raw" };

    static Ph ParsePh(string inner)
    {
        Ph p = new Ph();
        p.Raw = inner;
        string[] bits = inner.Split('|');
        Match m = Regex.Match(bits[0].Trim(), @"^(?:(input|secret|record)\.)?([A-Za-z_][A-Za-z0-9_]*)$");
        for (int i = 1; i < bits.Length; i++) p.Filters.Add(bits[i].Trim().ToLowerInvariant());
        if (!m.Success) { p.Bad = "name"; return p; }
        p.Ns = m.Groups[1].Value;
        p.Name = m.Groups[2].Value;
        p.Full = (p.Ns.Length > 0 ? p.Ns + "." : "") + p.Name;
        foreach (string f in p.Filters) if (Array.IndexOf(PhFilters, f) < 0) p.Bad = "filter";
        return p;
    }

    static string Filtered(string v, List<string> filters)
    {
        foreach (string f in filters)
        {
            if (f == "upper") v = v.ToUpperInvariant();
            else if (f == "lower") v = v.ToLowerInvariant();
            else if (f == "trim") v = v.Trim();
            else if (f == "base64") v = Convert.ToBase64String(Encoding.UTF8.GetBytes(v));
        }
        return v;
    }

    //  a value by name: a secret of the step's connection, else what the page
    //  sent, else a hidden one of this run. null when there is none - and,
    //  for a secret, the reason is in c.Errors.
    static string Lookup(Ph p, StepCtx c, bool secretsToo)
    {
        if (p.Ns == "secret")
        {
            if (!secretsToo) { c.Errors.Add("{{" + p.Full + "}}: a condition cannot read a secret"); return null; }
            return SecretFor(c, p.Name);
        }
        string v;
        if (c.Values.TryGetValue(p.Full, out v)) return v;
        lock (c.Run) { if (c.Run.Hidden.TryGetValue(p.Full, out v)) return v; }
        return null;
    }

    //  how: "path" (each value %-escaped, so it stays one piece of the
    //  path), "json" (escaped as the inside of a JSON string), "xml", "none"
    static string Render(string text, StepCtx c, string how)
    {
        if (string.IsNullOrEmpty(text)) return "";
        return PhRe.Replace(text, delegate(Match m)
        {
            Ph p = ParsePh(m.Groups[1].Value);
            if (p.Bad == "name") { c.Errors.Add("\"{{" + p.Raw + "}}\" is not a name KalKech knows"); return ""; }
            if (p.Bad == "filter") { c.Errors.Add("{{" + p.Raw + "}} has a filter KalKech does not know"); return ""; }
            int before = c.Errors.Count;
            string v = Lookup(p, c, true);
            if (v == null)
            {
                if (c.Errors.Count == before) c.Errors.Add("{{" + p.Full + "}} has no value - nothing gave it one before this step");
                return "";
            }
            v = Filtered(v, p.Filters);
            if (p.Filters.Contains("raw")) return v;
            if (how == "path") return Uri.EscapeDataString(v);
            if (how == "json") { string j = Json(v); return j.Substring(1, j.Length - 2); }
            if (how == "xml") return XmlText(v);
            return v;
        });
    }

    static string XmlText(string v)
    {
        return v.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;").Replace("'", "&apos;");
    }

    //  ── secrets ────────────────────────────────────────────────────────────
    static string SecretsPath()
    {
        string over = Environment.GetEnvironmentVariable("KALKECH_SECRETS");
        if (over != null && over.Length > 0) return over;
        string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KalKech");
        return Path.Combine(dir, "secrets.dat");
    }

    static JObj SecretsLoad()
    {
        string p = SecretsPath();
        try
        {
            if (!File.Exists(p)) return new JObj();
            JObj root = JsonReader.Parse(File.ReadAllText(p, Encoding.UTF8)) as JObj;
            JObj items = root == null ? null : root.Get("items") as JObj;
            return items ?? new JObj();
        }
        catch (Exception e)
        {
            Log("  ! secrets: could not read " + p + ": " + e.Message);
            return new JObj();
        }
    }

    static void SecretsSave(JObj items)
    {
        string p = SecretsPath();
        string dir = Path.GetDirectoryName(p);
        if (dir != null && dir.Length > 0 && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
        string text = "{\"v\":1,\"note\":" + Json("KalKech secrets - encrypted for one Windows user on one PC; useless anywhere else") +
                      ",\"items\":" + JsonOf(items) + "}";
        string tmp = p + ".new";
        File.WriteAllText(tmp, text, new UTF8Encoding(false));
        if (File.Exists(p))
        {
            try { File.Replace(tmp, p, null); return; }
            catch (Exception) { File.Delete(p); }
        }
        File.Move(tmp, p);
    }

    //  "https://Api.Example.local/v2/" -> "https://api.example.local:443/v2"
    static string NormBase(string b)
    {
        Uri u;
        if (!BaseOk(b, out u)) return "";
        return u.Scheme + "://" + u.Host.ToLowerInvariant() + ":" + u.Port + u.AbsolutePath.TrimEnd('/');
    }

    static bool BaseOk(string b, out Uri u)
    {
        u = null;
        if (string.IsNullOrEmpty(b)) return false;
        if (!Uri.TryCreate(b.Trim(), UriKind.Absolute, out u)) return false;
        if (u.Scheme != "http" && u.Scheme != "https") return false;
        if (u.UserInfo.Length > 0 || u.Query.Length > 0 || u.Fragment.Length > 0) return false;
        return true;
    }

    static string SecretFor(StepCtx c, string name)
    {
        if (c.Conn == null) { c.Errors.Add("{{secret." + name + "}} needs the step to have a connection"); return null; }
        if (!c.ConnSecrets.Contains(name))
        {
            c.Errors.Add("\"" + name + "\" is not one of the secrets of " + c.ConnName);
            return null;
        }
        JObj item;
        lock (SecretLock) { item = SecretsLoad().Get(c.ConnId + "/" + name) as JObj; }
        if (item == null)
        {
            c.Errors.Add("the secret \"" + name + "\" of " + c.ConnName + " has not been saved on this PC (Menu, Automations, Connections)");
            return null;
        }
        if (JS(item, "origin") != NormBase(c.ConnBase))
        {
            c.Errors.Add("the address of " + c.ConnName + " has changed since its secret \"" + name +
                         "\" was saved, so it is not sent there. If the new address is right, save the secret again.");
            return null;
        }
        string v;
        try
        {
            byte[] plain = ProtectedData.Unprotect(Convert.FromBase64String(JS(item, "v")), SecretEntropy, DataProtectionScope.CurrentUser);
            v = Encoding.UTF8.GetString(plain);
        }
        catch (Exception)
        {
            c.Errors.Add("the secret \"" + name + "\" of " + c.ConnName + " cannot be read - it was saved by another Windows user or on another PC. Save it again.");
            return null;
        }
        AddKnown(c.Run, v);
        return v;
    }

    //  GET    /secrets?conn=<id>&base=<address>   which are saved (never what)
    //  POST   /secrets  {conn, base, name, value}  save one (empty value: remove)
    //  DELETE /secrets?conn=<id>[&name=<name>]     remove one, or all of a connection's
    static void SecretsRoute(NetworkStream net, string method, string query, byte[] body)
    {
        if (method == "GET")
        {
            string conn = QueryValue(query, "conn");
            string want = NormBase(QueryValue(query, "base"));
            JOut names = new JOut();
            lock (SecretLock)
            {
                JObj items = SecretsLoad();
                foreach (string k in items.Keys)
                {
                    if (!k.StartsWith(conn + "/")) continue;
                    JObj it = items.Get(k) as JObj;
                    if (it == null) continue;
                    names.Raw(k.Substring(conn.Length + 1), new JOut().B("set", true).S("at", JS(it, "at"))
                        .B("same", want.Length > 0 && JS(it, "origin") == want).ToString());
                }
            }
            Respond(net, 200, "application/json", Bytes(new JOut().B("ok", true).Raw("names", names.ToString()).ToString()));
            return;
        }
        if (method == "DELETE")
        {
            string conn = QueryValue(query, "conn"), name = QueryValue(query, "name");
            if (!Regex.IsMatch(conn, "^[A-Za-z0-9_-]{1,40}$")) { Respond(net, 400, "application/json", Bytes("{\"error\":\"bad connection\"}")); return; }
            int n = 0;
            lock (SecretLock)
            {
                JObj items = SecretsLoad(), keep = new JObj();
                foreach (string k in items.Keys)
                {
                    bool drop = name.Length > 0 ? k == conn + "/" + name : k.StartsWith(conn + "/");
                    if (drop) n++; else keep.Set(k, items.Get(k));
                }
                if (n > 0) SecretsSave(keep);
            }
            Log("  secrets   " + n + " removed from " + conn);
            Respond(net, 200, "application/json", Bytes(new JOut().B("ok", true).N("removed", n).ToString()));
            return;
        }
        if (method != "POST") { Respond(net, 405, "application/json", Bytes("{\"error\":\"GET, POST or DELETE\"}")); return; }
        JObj req = null;
        try { req = JsonReader.Parse(Encoding.UTF8.GetString(body)) as JObj; } catch (Exception) { }
        if (req == null) { Respond(net, 400, "application/json", Bytes("{\"error\":\"not JSON\"}")); return; }
        string cid = JS(req, "conn"), nm = JS(req, "name"), value = JS(req, "value"), origin = NormBase(JS(req, "base"));
        if (!Regex.IsMatch(cid, "^[A-Za-z0-9_-]{1,40}$") || !Regex.IsMatch(nm, "^[A-Za-z_][A-Za-z0-9_]{0,39}$"))
        { Respond(net, 400, "application/json", Bytes("{\"ok\":false,\"error\":\"a bad connection or secret name\"}")); return; }
        if (origin.Length == 0)
        { Respond(net, 400, "application/json", Bytes("{\"ok\":false,\"error\":\"the connection needs an http:// or https:// address before a secret can be saved for it\"}")); return; }
        if (value.Length > 16000)
        { Respond(net, 400, "application/json", Bytes("{\"ok\":false,\"error\":\"that is too long for a secret\"}")); return; }
        lock (SecretLock)
        {
            JObj items = SecretsLoad();
            JObj keep = new JObj();
            foreach (string k in items.Keys) if (k != cid + "/" + nm) keep.Set(k, items.Get(k));
            if (value.Length > 0)
            {
                byte[] sealedBytes = ProtectedData.Protect(Encoding.UTF8.GetBytes(value), SecretEntropy, DataProtectionScope.CurrentUser);
                JObj it = new JObj();
                it.Set("v", Convert.ToBase64String(sealedBytes));
                it.Set("origin", origin);
                it.Set("at", DateTime.UtcNow.ToString("o"));
                keep.Set(cid + "/" + nm, it);
            }
            SecretsSave(keep);
        }
        Log("  secrets   " + (value.Length > 0 ? "saved " : "removed ") + nm + " for " + cid);
        Respond(net, 200, "application/json", Bytes("{\"ok\":true}"));
    }

    //  ── an API call ────────────────────────────────────────────────────────
    static readonly string[] Methods = { "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD" };
    static readonly string[] ForbiddenHeaders = { "host", "content-length", "connection", "transfer-encoding", "expect", "te",
                                                  "upgrade", "keep-alive", "proxy-authorization", "proxy-connection", "trailer" };

    static void EnsureTls()
    {
        if (TlsSet) return;
        //  TLS 1.2 (and 1.1, 1.0 for an old server). A program built by the
        //  csc in the Windows folder starts with the framework's oldest
        //  defaults, which modern servers refuse.
        try { ServicePointManager.SecurityProtocol = (SecurityProtocolType)(3072 | 768 | 192); } catch (Exception) { }
        ServicePointManager.Expect100Continue = false;
        TlsSet = true;
    }

    static bool UnderBase(Uri u, Uri b)
    {
        if (u.Scheme != b.Scheme || !string.Equals(u.Host, b.Host, StringComparison.OrdinalIgnoreCase) || u.Port != b.Port) return false;
        if (u.UserInfo.Length > 0) return false;
        string bp = b.AbsolutePath.TrimEnd('/');
        string up = u.AbsolutePath;
        return bp.Length == 0 || up == bp || up.StartsWith(bp + "/", StringComparison.Ordinal);
    }

    static bool ExpectMatch(string expect, int status)
    {
        string e = (expect ?? "").Trim().ToLowerInvariant();
        if (e.Length == 0) e = "2xx";
        if (e == "any") return true;
        foreach (string part in e.Split(','))
        {
            string p = part.Trim();
            if (p.Length == 3 && p.EndsWith("xx") && p[0] >= '1' && p[0] <= '5') { if (status / 100 == p[0] - '0') return true; }
            else { int n; if (int.TryParse(p, out n) && n == status) return true; }
        }
        return false;
    }

    static string NetError(WebException we, int seconds)
    {
        switch (we.Status)
        {
            case WebExceptionStatus.Timeout: return "no answer within " + seconds + " seconds";
            case WebExceptionStatus.NameResolutionFailure: return "the address's name could not be found (DNS) - check the connection's address, and that this PC is on the company network";
            case WebExceptionStatus.ConnectFailure: return "nothing answered at that address - the service may be down, or blocked from this PC";
            case WebExceptionStatus.TrustFailure: return "the server's certificate is not trusted on this PC";
            case WebExceptionStatus.SecureChannelFailure: return "a secure (TLS) connection could not be made with the server";
            case WebExceptionStatus.ProxyNameResolutionFailure: return "the proxy could not be found - try the connection with \"no proxy\"";
            case WebExceptionStatus.ConnectionClosed:
            case WebExceptionStatus.ReceiveFailure:
            case WebExceptionStatus.SendFailure: return "the connection was closed before an answer came (" + we.Message + ")";
        }
        return we.Message;
    }

    static string DoHttp(StepCtx c, JObj step, string until, bool test)
    {
        if (c.Conn == null) return Failed("this step has no connection - choose one in the step", c);
        string baseUrl = JS(c.Conn, "base").Trim().TrimEnd('/');
        Uri baseUri;
        if (!BaseOk(baseUrl, out baseUri))
            return Failed("the address of " + c.ConnName + " is not an http:// or https:// address: " + baseUrl, c);
        string method = JS(step, "method").ToUpperInvariant();
        if (Array.IndexOf(Methods, method) < 0) method = "GET";

        string path = Render(JS(step, "path"), c, "path");
        StringBuilder q = new StringBuilder();
        foreach (object o in JA(step, "query"))
        {
            List<object> pr = o as List<object>;
            if (pr == null || pr.Count < 2) continue;
            string k = Render(TextOf(pr[0]), c, "none"), v = Render(TextOf(pr[1]), c, "none");
            if (k.Length == 0) continue;
            q.Append(q.Length > 0 ? "&" : "").Append(Uri.EscapeDataString(k)).Append('=').Append(Uri.EscapeDataString(v));
        }
        List<string[]> hdrs = new List<string[]>();
        foreach (object o in JA(step, "headers"))
        {
            List<object> pr = o as List<object>;
            if (pr == null || pr.Count < 2) continue;
            string name = TextOf(pr[0]).Trim();
            if (!Regex.IsMatch(name, @"^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$")) { c.Errors.Add("\"" + name + "\" is not a header name"); continue; }
            if (Array.IndexOf(ForbiddenHeaders, name.ToLowerInvariant()) >= 0) { c.Errors.Add(name + " is set by KalKech itself"); continue; }
            string val = Render(TextOf(pr[1]), c, "none");
            if (val.IndexOf('\r') >= 0 || val.IndexOf('\n') >= 0 || val.IndexOf('\0') >= 0)
            { c.Errors.Add("the header " + name + " would hold a line break - refused, it could add headers of its own"); continue; }
            hdrs.Add(new string[] { name, val });
        }
        string bodyType = JS(step, "bodyType");
        string bodyText = null, ctype = null;
        if (bodyType == "json")
        {
            bodyText = Render(JS(step, "body"), c, "json");
            ctype = "application/json; charset=utf-8";
            if (c.Errors.Count == 0 && bodyText.Trim().Length > 0)
            {
                try { JsonReader.Parse(bodyText); }
                catch (Exception e) { c.Errors.Add("the body is not valid JSON once filled in (" + e.Message + ")"); }
            }
        }
        else if (bodyType == "xml") { bodyText = Render(JS(step, "body"), c, "xml"); ctype = "application/xml; charset=utf-8"; }
        else if (bodyType == "text") { bodyText = Render(JS(step, "body"), c, "none"); ctype = "text/plain; charset=utf-8"; }
        else if (bodyType == "form")
        {
            StringBuilder f = new StringBuilder();
            foreach (object o in JA(step, "form"))
            {
                List<object> pr = o as List<object>;
                if (pr == null || pr.Count < 2) continue;
                string k = Render(TextOf(pr[0]), c, "none"), v = Render(TextOf(pr[1]), c, "none");
                if (k.Length == 0) continue;
                f.Append(f.Length > 0 ? "&" : "").Append(Uri.EscapeDataString(k)).Append('=').Append(Uri.EscapeDataString(v));
            }
            bodyText = f.ToString();
            ctype = "application/x-www-form-urlencoded";
        }
        if (bodyText != null && (method == "GET" || method == "HEAD")) c.Errors.Add("a " + method + " request cannot carry a body");

        //  the connection signs in by itself, unless the step does it
        string auth = JS(c.Conn, "auth");
        bool stepAuth = false;
        foreach (string[] h in hdrs) if (h[0].ToLowerInvariant() == "authorization") stepAuth = true;
        if (auth == "basic" && !stepAuth)
        {
            string user = SecretFor(c, "username"), pass = SecretFor(c, "password");
            if (user != null && pass != null)
            {
                string pair = Convert.ToBase64String(Encoding.UTF8.GetBytes(user + ":" + pass));
                AddKnown(c.Run, pair);
                hdrs.Add(new string[] { "Authorization", "Basic " + pair });
            }
        }
        else if (auth == "bearer" && !stepAuth)
        {
            string tok = SecretFor(c, "token");
            if (tok != null) hdrs.Add(new string[] { "Authorization", "Bearer " + tok });
        }
        else if (auth == "header")
        {
            string hn = JS(c.Conn, "header").Trim();
            if (!Regex.IsMatch(hn, @"^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$") || Array.IndexOf(ForbiddenHeaders, hn.ToLowerInvariant()) >= 0)
                c.Errors.Add("the connection's key header \"" + hn + "\" is not a header name");
            else
            {
                bool has = false;
                foreach (string[] h in hdrs) if (string.Equals(h[0], hn, StringComparison.OrdinalIgnoreCase)) has = true;
                string key = has ? "" : SecretFor(c, "apiKey");
                if (!has && key != null) hdrs.Add(new string[] { hn, key });
            }
        }
        if (c.Errors.Count > 0) return Failed(string.Join("; ", c.Errors.ToArray()), c);

        string full = baseUrl + path;
        if (q.Length > 0) full += (full.IndexOf('?') >= 0 ? "&" : "?") + q.ToString();
        Uri u;
        if (!Uri.TryCreate(full, UriKind.Absolute, out u)) return Failed("the address this makes is not a valid one: " + full, c);
        if (!UnderBase(u, baseUri))
            return Failed("the address this makes (" + u.GetLeftPart(UriPartial.Path) + ") is outside " + c.ConnName +
                          " (" + baseUrl + "). A step only ever goes to its own connection's address.", c);
        string shownUrl = Redact(u.GetLeftPart(UriPartial.Path) + u.Query, c.Run);

        int seconds = Math.Max(1, Math.Min(120, JN(c.Conn, "timeout", 30)));
        EnsureTls();
        Stopwatch sw = Stopwatch.StartNew();
        HttpWebRequest req = (HttpWebRequest)WebRequest.Create(u);
        req.Method = method;
        req.AllowAutoRedirect = false;
        req.Timeout = seconds * 1000;
        req.ReadWriteTimeout = seconds * 1000;
        req.UserAgent = "KalKech";
        req.KeepAlive = false;
        if (auth == "windows") { req.UseDefaultCredentials = true; req.PreAuthenticate = true; }
        if (JS(c.Conn, "proxy") == "none") req.Proxy = null;
        else
        {
            IWebProxy px = WebRequest.DefaultWebProxy;
            if (px != null) px.Credentials = CredentialCache.DefaultCredentials;
            req.Proxy = px;
        }
        foreach (string[] h in hdrs)
        {
            string low = h[0].ToLowerInvariant();
            try
            {
                if (low == "content-type") req.ContentType = h[1];
                else if (low == "accept") req.Accept = h[1];
                else if (low == "user-agent") req.UserAgent = h[1];
                else if (low == "referer") req.Referer = h[1];
                else if (low == "date" || low == "if-modified-since" || low == "range") c.Errors.Add(h[0] + " cannot be set on a step");
                else req.Headers[h[0]] = h[1];
            }
            catch (Exception e) { c.Errors.Add("the header " + h[0] + " was refused: " + e.Message); }
        }
        if (c.Errors.Count > 0) return Failed(string.Join("; ", c.Errors.ToArray()), c);

        HttpWebResponse resp = null;
        string netErr = null;
        try
        {
            if (bodyText != null)
            {
                byte[] bb = Encoding.UTF8.GetBytes(bodyText);
                if (req.ContentType == null) req.ContentType = ctype;
                req.ContentLength = bb.Length;
                using (Stream rs = req.GetRequestStream()) rs.Write(bb, 0, bb.Length);
            }
            resp = (HttpWebResponse)req.GetResponse();
        }
        catch (WebException we)
        {
            resp = we.Response as HttpWebResponse;
            if (resp == null) netErr = NetError(we, seconds);
        }
        catch (Exception e) { netErr = e.Message; }
        if (resp == null)
        {
            Log("  auto      " + method + " " + Redact(u.GetLeftPart(UriPartial.Path), c.Run) + " - " + Redact(netErr ?? "", c.Run));
            return new JOut().B("ok", false).S("url", shownUrl).N("ms", sw.ElapsedMilliseconds)
                .S("error", Redact(netErr ?? "no answer", c.Run)).ToString();
        }

        int status;
        string text = "", rtype = "";
        bool cut = false;
        Dictionary<string, string> rh = new Dictionary<string, string>();
        using (resp)
        {
            status = (int)resp.StatusCode;
            rtype = resp.ContentType ?? "";
            foreach (string k in resp.Headers.AllKeys) rh[k.ToLowerInvariant()] = resp.Headers[k];
            if (method != "HEAD")
            {
                try
                {
                    using (Stream s = resp.GetResponseStream())
                    {
                        MemoryStream ms = new MemoryStream();
                        byte[] buf = new byte[65536];
                        int n;
                        while ((n = s.Read(buf, 0, buf.Length)) > 0)
                        {
                            int room = AutoBodyMax - (int)ms.Length;
                            if (room <= 0) { cut = true; break; }
                            ms.Write(buf, 0, Math.Min(n, room));
                        }
                        text = Decoded(ms.ToArray(), rtype);
                    }
                }
                catch (Exception e) { text = ""; rh["x-kalkech-read"] = e.Message; }
            }
        }
        long took = sw.ElapsedMilliseconds;
        Log("  auto      " + method + " " + Redact(u.GetLeftPart(UriPartial.Path), c.Run) + " - " + status + " (" + took + " ms)");

        bool statusOk = ExpectMatch(JS(step, "expect"), status);
        string why = statusOk ? "" : status >= 300 && status < 400
            ? "the address answered with a redirect (" + status + ") to " + (rh.ContainsKey("location") ? rh["location"] : "somewhere else") + ", which is not followed"
            : "the answer was " + status + (StatusWords(status).Length > 0 ? " " + StatusWords(status) : "") + ", not what this step expects (" + (JS(step, "expect").Length > 0 ? JS(step, "expect") : "2xx") + ")";
        Dictionary<string, string> saved = new Dictionary<string, string>();
        List<string> hidden = new List<string>(), missing = new List<string>(), redacted = new List<string>();
        bool ok = Outcome(c, step, text, rh, status, -1, statusOk, ref why, saved, hidden, missing, redacted);
        return StepAnswer(c, ok, status, -1, took, shownUrl, text, cut, rtype, rh, saved, hidden, missing, redacted, until, test,
                          why, WantsReply(step) ? text : null);
    }

    static bool WantsReply(JObj step) { string w = JS(step, "reply"); return w == "me" || w == "ai"; }

    static string StatusWords(int s)
    {
        switch (s)
        {
            case 400: return "Bad Request"; case 401: return "Unauthorized - the sign-in was refused"; case 403: return "Forbidden";
            case 404: return "Not Found"; case 405: return "Method Not Allowed"; case 408: return "Request Timeout";
            case 409: return "Conflict"; case 415: return "Unsupported Media Type"; case 422: return "Unprocessable Entity";
            case 429: return "Too Many Requests"; case 500: return "Internal Server Error"; case 502: return "Bad Gateway";
            case 503: return "Service Unavailable"; case 504: return "Gateway Timeout";
        }
        return "";
    }

    static string Decoded(byte[] b, string contentType)
    {
        Encoding enc = new UTF8Encoding(false);
        Match m = Regex.Match(contentType ?? "", @"charset=""?([A-Za-z0-9_\-.:]+)", RegexOptions.IgnoreCase);
        if (m.Success) { try { enc = Encoding.GetEncoding(m.Groups[1].Value); } catch (Exception) { } }
        return enc.GetString(b);
    }

    //  Did the step work, and what does it keep? From a reply (status -1 for
    //  a script) or a script's output (exit >= 0):
    //    1. every "save" row is read from the reply, whatever happened - an
    //       API's error reply is a JSON of its own, worth reading;
    //    2. the step worked when its status was expected AND its "success
    //       also needs" test (okWhen, which may read those values) is true;
    //    3. only the rows meant for that outcome are kept: "ok" (when it
    //       worked, the default), "fail" (when it did not) or "any".
    //  Returns whether it worked; why holds the reason when it did not.
    static bool Outcome(StepCtx c, JObj step, string text, Dictionary<string, string> heads, int status, int exit,
                        bool statusOk, ref string why,
                        Dictionary<string, string> saved, List<string> hidden, List<string> missing, List<string> redacted)
    {
        List<string[]> rows = new List<string[]>();      // name, show, on, value (null: not found)
        ReadSaves(c, step, text, heads, status, exit, rows);
        bool ok = statusOk;
        string okWhen = JS(step, "okWhen").Trim();
        if (ok && okWhen.Length > 0)
        {
            Dictionary<string, string> extra = new Dictionary<string, string>();
            foreach (string[] r in rows) if (r[3] != null) extra[r[0]] = r[3];
            extra["status"] = (exit >= 0 ? exit : status).ToString();
            bool met;
            string err = CondEval(okWhen, c, extra, out met);
            if (err != null) { ok = false; why = "its \"success also needs\": " + err; }
            else if (!met) { ok = false; why = "the reply says it did not work (\"success also needs\" " + okWhen + " is not true)"; }
        }
        string outcome = ok ? "ok" : "fail";
        foreach (string[] r in rows)
        {
            string on = r[2] == "fail" || r[2] == "any" ? r[2] : "ok";
            if (on != "any" && on != outcome) continue;
            string name = r[0], show = r[1], v = r[3];
            if (v == null) { missing.Add(name); continue; }
            if (show == "hidden")
            {
                lock (c.Run) { c.Run.Hidden[name] = v; }
                AddKnown(c.Run, v);
                hidden.Add(name);
                saved.Remove(name);
            }
            else
            {
                lock (c.Run) { c.Run.Hidden.Remove(name); }
                if (v.Length > AutoValueMax) v = v.Substring(0, AutoValueMax);
                saved[name] = v;
            }
        }
        //  A shown value must not be a way to carry a secret out. One that
        //  holds a secret or a hidden value of this run, or is shaped like a
        //  token or a password field, is kept HIDDEN instead - the steps
        //  after it still get it; the page is told it was held back.
        List<string> keys = new List<string>(saved.Keys);
        foreach (string k in keys)
        {
            string v = saved[k];
            if (Redact(v, c.Run) == v && !LooksSecret(v)) continue;
            lock (c.Run) { c.Run.Hidden[k] = v; }
            AddKnown(c.Run, v);
            saved.Remove(k);
            if (!hidden.Contains(k)) hidden.Add(k);
            redacted.Add(k);
        }
        return ok;
    }

    //  every save row, read from the reply - nothing kept yet
    static void ReadSaves(StepCtx c, JObj step, string text, Dictionary<string, string> heads, int status, int exit,
                          List<string[]> rows)
    {
        object json = null;
        bool jsonTried = false;
        foreach (object o in JA(step, "save"))
        {
            JObj sv = o as JObj;
            if (sv == null) continue;
            string name = JS(sv, "name"), from = JS(sv, "from"), path = JS(sv, "path"), show = JS(sv, "show"), on = JS(sv, "on");
            if (!Regex.IsMatch(name, "^[A-Za-z_][A-Za-z0-9_]{0,39}$")) continue;
            string v = null;
            if (from == "json")
            {
                if (!jsonTried) { jsonTried = true; try { json = JsonReader.Parse(text.Trim()); } catch (Exception) { json = null; } }
                object found;
                if (json != null && JsonAt(json, path, out found)) v = TextOf(found);
            }
            else if (from == "header") { string hv; if (heads != null && heads.TryGetValue(path.ToLowerInvariant(), out hv)) v = hv; }
            else if (from == "status") v = status.ToString();
            else if (from == "exit") v = exit.ToString();
            else if (from == "body" || from == "output") v = from == "output" ? text.Trim() : text;
            else if (from == "regex")
            {
                try
                {
                    Match m = new Regex(path, RegexOptions.None, TimeSpan.FromSeconds(2)).Match(text);
                    if (m.Success) v = m.Groups.Count > 1 && m.Groups[1].Success ? m.Groups[1].Value : m.Value;
                }
                catch (ArgumentException) { c.Errors.Add("the pattern for " + name + " is not a valid one"); }
                catch (RegexMatchTimeoutException) { c.Errors.Add("the pattern for " + name + " took too long"); }
            }
            rows.Add(new string[] { name, show, on, v });
        }
    }

    static string StepAnswer(StepCtx c, bool ok, int status, int exit, long ms, string url, string text, bool cut, string type,
                             Dictionary<string, string> heads, Dictionary<string, string> saved, List<string> hidden,
                             List<string> missing, List<string> redacted, string until, bool test, string error,
                             string replyText)
    {
        bool bodyCut = cut;     // the reply itself was longer than was read (not the excerpt)
        if (c.Errors.Count > 0) { ok = false; error = (error.Length > 0 ? error + "; " : "") + string.Join("; ", c.Errors.ToArray()); }
        bool hasUntil = false, met = false;
        if (ok && until.Length > 0)
        {
            //  what this step saved, shown or hidden, and its own status
            Dictionary<string, string> extra = new Dictionary<string, string>(saved);
            extra["status"] = (exit >= 0 ? exit : status).ToString();
            string err = CondEval(until, c, extra, out met);
            if (err != null) { ok = false; error = "its \"repeat until\": " + err; }
            else hasUntil = true;
        }
        JOut o = new JOut().B("ok", ok);
        if (status >= 0) o.N("status", status);
        if (exit >= 0) o.N("exit", exit).N("status", exit);
        o.N("ms", ms);
        if (url != null) o.S("url", url);
        JOut sv = new JOut();
        foreach (KeyValuePair<string, string> kv in saved) sv.S(kv.Key, kv.Value);
        o.Raw("saved", sv.ToString()).Raw("hidden", JsonList(hidden)).Raw("missing", JsonList(missing)).Raw("redacted", JsonList(redacted));
        if (hasUntil) o.B("until", met);
        string ex = Redact(text ?? "", c.Run);
        int lim = test ? 20000 : 600;
        if (ex.Length > lim) { ex = ex.Substring(0, lim); cut = true; }
        o.S("excerpt", ex).B("cut", cut).S("contentType", type ?? "");
        if (test && heads != null)
        {
            JOut hh = new JOut();
            foreach (string k in new string[] { "content-type", "location", "retry-after", "x-request-id", "x-correlation-id" })
                if (heads.ContainsKey(k)) hh.S(k, Redact(heads[k], c.Run));
            o.Raw("headers", hh.ToString());
        }
        //  the whole reply, when the step keeps it: with every secret and
        //  hidden value of the run - this step's included - masked out
        if (replyText != null)
        {
            string rp = Redact(replyText, c.Run);
            bool rcut = bodyCut;
            if (rp.Length > 200000) { rp = rp.Substring(0, 200000); rcut = true; }
            o.S("reply", rp).B("replyCut", rcut);
        }
        if (!ok) o.S("error", Redact(error, c.Run));
        return o.ToString();
    }

    //  ── a script ───────────────────────────────────────────────────────────
    static readonly Regex CmdBad = new Regex("[\"%!^&|<>()\\r\\n\\0]");

    static string DoScript(StepCtx c, JObj step, string until, bool test)
    {
        if (Workspace == null)
            return Failed("KalKech does not know your workspace folder, so it cannot find your scripts. " +
                          "Choose it from the icon by the clock: Workspace folder...", c);
        string file = JS(step, "file");
        bool kindOk = IsWindows ? Regex.IsMatch(file, @"^[A-Za-z0-9 _.\-]{1,120}\.(bat|cmd)$", RegexOptions.IgnoreCase)
                                : Regex.IsMatch(file, @"^[A-Za-z0-9 _.\-]{1,120}\.(sh)$", RegexOptions.IgnoreCase);
        if (!kindOk || file.StartsWith(".") || file.IndexOf("..") >= 0)
            return Failed("\"" + file + "\" is not a script this can run - a .bat or .cmd file in your scripts folder, with a plain name", c);
        string dir = Path.Combine(Workspace, "scripts");
        string full = Path.Combine(dir, file);
        if (!File.Exists(full)) return Failed("there is no " + file + " in " + dir, c);

        StringBuilder line = new StringBuilder();
        Dictionary<string, string> env = new Dictionary<string, string>();
        foreach (object o in JA(step, "args"))
        {
            List<object> pr = o as List<object>;
            if (pr == null || pr.Count < 2) continue;
            string name = TextOf(pr[0]).Trim();
            if (!Regex.IsMatch(name, @"^[A-Za-z0-9_ .\-]{1,40}$")) { c.Errors.Add("\"" + name + "\" is not a value name a script can be given"); continue; }
            string v = Render(TextOf(pr[1]), c, "none");
            Match bad = CmdBad.Match(v);
            if (bad.Success)
            {
                string ch = bad.Value == "\r" || bad.Value == "\n" ? "a line break" : bad.Value == "\0" ? "a NUL" : bad.Value;
                c.Errors.Add("the value for " + name + " has " + ch + " in it, which a script's command line would act on - it was not passed");
                continue;
            }
            line.Append(" \"").Append(v).Append('"');
            env["KK_" + Regex.Replace(name.ToUpperInvariant(), "[^A-Z0-9_]", "_")] = v;
        }
        if (c.Errors.Count > 0) return Failed(string.Join("; ", c.Errors.ToArray()), c);

        int seconds = Math.Max(1, Math.Min(600, JN(step, "timeout", 120)));
        ProcessStartInfo psi = IsWindows
            ? new ProcessStartInfo("cmd.exe", "/d /s /c \"\"" + full + "\"" + line.ToString() + "\"")
            : new ProcessStartInfo("/bin/sh", "\"" + full + "\"" + line.ToString());
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.WindowStyle = ProcessWindowStyle.Hidden;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.RedirectStandardInput = true;
        psi.WorkingDirectory = dir;
        if (IsWindows)
        {
            try
            {
                Encoding oem = Encoding.GetEncoding(CultureInfo.CurrentCulture.TextInfo.OEMCodePage);
                psi.StandardOutputEncoding = oem;
                psi.StandardErrorEncoding = oem;
            }
            catch (Exception) { }
        }
        foreach (KeyValuePair<string, string> kv in env) psi.EnvironmentVariables[kv.Key] = kv.Value;
        psi.EnvironmentVariables["KALKECH"] = "1";

        StringBuilder outB = new StringBuilder(), errB = new StringBuilder();
        Stopwatch sw = Stopwatch.StartNew();
        Process p;
        try { p = Process.Start(psi); }
        catch (Exception e) { return Failed("the script could not be started: " + e.Message, c); }
        bool finished;
        int exit = -1;
        using (p)
        {
            p.OutputDataReceived += delegate(object s, DataReceivedEventArgs e) { if (e.Data != null) lock (outB) { if (outB.Length < 1024 * 1024) outB.Append(e.Data).Append('\n'); } };
            p.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e) { if (e.Data != null) lock (errB) { if (errB.Length < 256 * 1024) errB.Append(e.Data).Append('\n'); } };
            try { p.StandardInput.Close(); } catch (Exception) { }      // a "pause" in it does not wait for ever
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
            finished = p.WaitForExit(seconds * 1000);
            if (!finished)
            {
                try
                {
                    if (IsWindows)
                    {
                        ProcessStartInfo kill = new ProcessStartInfo("taskkill", "/PID " + p.Id + " /T /F");
                        kill.UseShellExecute = false;
                        kill.CreateNoWindow = true;
                        Process.Start(kill).WaitForExit(5000);
                    }
                    else p.Kill();
                }
                catch (Exception) { }
            }
            else { p.WaitForExit(); exit = p.ExitCode; }
        }
        long took = sw.ElapsedMilliseconds;
        string output, errors;
        lock (outB) output = outB.ToString();
        lock (errB) errors = errB.ToString();
        Log("  auto      script " + file + " - " + (finished ? "exit " + exit : "stopped after " + seconds + " s") + " (" + took + " ms)");
        if (!finished)
            return new JOut().B("ok", false).N("ms", took).S("excerpt", Redact(Tail(output + errors, 600), c.Run))
                .S("error", "it ran for longer than " + seconds + " seconds and was stopped").ToString();

        string expect = JS(step, "expect").Trim().ToLowerInvariant();
        if (expect.Length == 0) expect = "0";
        bool statusOk = expect == "any";
        if (!statusOk) foreach (string part in expect.Split(',')) { int n; if (int.TryParse(part.Trim(), out n) && n == exit) statusOk = true; }
        string why = statusOk ? "" : "it finished with exit code " + exit + ", not " + expect;
        Dictionary<string, string> saved = new Dictionary<string, string>();
        List<string> hidden = new List<string>(), missing = new List<string>(), redacted = new List<string>();
        bool ok = Outcome(c, step, output, null, -1, exit, statusOk, ref why, saved, hidden, missing, redacted);
        string shown = errors.Trim().Length > 0 && !ok ? output + "\n" + errors : output;
        return StepAnswer(c, ok, -1, exit, took, null, test ? shown : Tail(shown, 600), false, "text/plain", null,
                          saved, hidden, missing, redacted, until, test, why,
                          WantsReply(step) ? (errors.Trim().Length > 0 ? output + "\n" + errors : output) : null);
    }

    static string Tail(string s, int n) { return s.Length <= n ? s : s.Substring(s.Length - n); }

    //  ── keeping secrets out of what goes back ──────────────────────────────
    static readonly Regex RedactJsonKey = new Regex(
        "(\"[^\"\\r\\n]{0,60}?(?:password|passwd|passphrase|pwd|secret|token(?![_-]?type\")|apikey|api_key|api-key|authorization|cookie|session|credential|private_?key|signature)[^\"\\r\\n]{0,40}\"\\s*:\\s*)(\"(?:[^\"\\\\]|\\\\.)*\"|[^,}\\]\\s]+)",
        RegexOptions.IgnoreCase);
    static readonly Regex RedactForm = new Regex(
        "((?<![A-Za-z0-9_])(?:access_token|refresh_token|id_token|token|password|passwd|pwd|secret|client_secret|api_key|apikey|session|code)=)[^&\\s\"'<]+",
        RegexOptions.IgnoreCase);
    static readonly Regex RedactXml = new Regex(
        "(<(?:[A-Za-z0-9_]+:)?(?:password|passwd|token|secret|apikey|api_key|sessionid|session|credential)[^>]*>)([^<]*)",
        RegexOptions.IgnoreCase);
    static readonly Regex RedactAuth = new Regex("\\b(Bearer|Basic|Negotiate|NTLM|Digest)\\s+[A-Za-z0-9\\-._~+/=]{8,}", RegexOptions.IgnoreCase);
    static readonly Regex RedactJwt = new Regex("\\beyJ[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]*");

    static string Redact(string text, AutoRun run)
    {
        if (string.IsNullOrEmpty(text)) return text ?? "";
        if (run != null)
        {
            List<string> known;
            lock (run) known = new List<string>(run.Known);
            known.Sort(delegate(string a, string b) { return b.Length.CompareTo(a.Length); });
            foreach (string k in known) if (k.Length >= 4) text = text.Replace(k, Dots);
        }
        text = RedactJsonKey.Replace(text, "$1\"" + Dots + "\"");
        text = RedactForm.Replace(text, "$1" + Dots);
        text = RedactXml.Replace(text, "$1" + Dots);
        text = RedactAuth.Replace(text, "$1 " + Dots);
        text = RedactJwt.Replace(text, Dots);
        return text;
    }

    static bool LooksSecret(string v)
    {
        string t = (v ?? "").Trim();
        return RedactJwt.IsMatch(t) || Regex.IsMatch(t, "^(Bearer|Basic|Negotiate|NTLM)\\s+\\S{8,}$", RegexOptions.IgnoreCase);
    }

    //  ── conditions ─────────────────────────────────────────────────────────
    class CondTok { public string T; public string V; public Ph P; }
    class CondNode { public string Op = "", Cmp = "", Lit; public CondNode A, B; public Ph P; public bool Neg; }
    static readonly string[] CondWords = { "and", "or", "not", "contains", "is", "empty", "starts", "ends", "with" };

    static List<CondTok> CondLex(string s, out string error)
    {
        error = null;
        List<CondTok> t = new List<CondTok>();
        int i = 0;
        while (i < s.Length)
        {
            char ch = s[i];
            if (char.IsWhiteSpace(ch)) { i++; continue; }
            if (ch == '{' && i + 1 < s.Length && s[i + 1] == '{')
            {
                int j = s.IndexOf("}}", i + 2, StringComparison.Ordinal);
                if (j < 0) { error = "a {{ with no }}"; return null; }
                CondTok k = new CondTok(); k.T = "ph"; k.P = ParsePh(s.Substring(i + 2, j - i - 2));
                t.Add(k); i = j + 2; continue;
            }
            if (ch == '"' || ch == '\'')
            {
                StringBuilder v = new StringBuilder();
                int j = i + 1;
                while (j < s.Length && s[j] != ch)
                {
                    if (s[j] == '\\' && j + 1 < s.Length) { v.Append(s[j + 1]); j += 2; }
                    else v.Append(s[j++]);
                }
                if (j >= s.Length) { error = "a quote that does not end"; return null; }
                CondTok k = new CondTok(); k.T = "lit"; k.V = v.ToString();
                t.Add(k); i = j + 1; continue;
            }
            Match num = Regex.Match(s.Substring(i), @"^-?\d+(?:\.\d+)?");
            if (num.Success && (ch != '-' || t.Count == 0 || t[t.Count - 1].T == "op"))
            {
                CondTok k = new CondTok(); k.T = "lit"; k.V = num.Value;
                t.Add(k); i += num.Value.Length; continue;
            }
            Match op = Regex.Match(s.Substring(i), @"^(==|!=|>=|<=|&&|\|\||=|>|<|!|\(|\))");
            if (op.Success)
            {
                string v = op.Value == "=" ? "==" : op.Value == "&&" ? "and" : op.Value == "||" ? "or" : op.Value == "!" ? "not" : op.Value;
                CondTok k = new CondTok(); k.T = "op"; k.V = v;
                t.Add(k); i += op.Value.Length; continue;
            }
            Match w = Regex.Match(s.Substring(i), "^[A-Za-z]+");
            if (w.Success)
            {
                string lw = w.Value.ToLowerInvariant();
                CondTok k = new CondTok();
                if (Array.IndexOf(CondWords, lw) >= 0) { k.T = "op"; k.V = lw; }
                else if (lw == "true" || lw == "false") { k.T = "lit"; k.V = lw; }
                else { error = "\"" + w.Value + "\" is not a word a condition knows"; return null; }
                t.Add(k); i += w.Value.Length; continue;
            }
            error = "\"" + ch + "\" cannot be in a condition";
            return null;
        }
        return t;
    }

    class CondParser
    {
        List<CondTok> t; int i;
        public CondParser(List<CondTok> toks) { t = toks; }
        bool Peek(string v) { return i < t.Count && t[i].T == "op" && t[i].V == v; }
        static Exception Bad(string why) { return new FormatException(why); }
        public CondNode Parse()
        {
            if (t.Count == 0) throw Bad("it is empty");
            CondNode n = Or();
            if (i < t.Count) throw Bad("there is more after the end of it");
            return n;
        }
        CondNode Atom()
        {
            if (i >= t.Count) throw Bad("it ends too soon");
            CondTok k = t[i];
            if (k.T == "ph")
            {
                if (k.P.Bad.Length > 0) throw Bad("{{" + k.P.Raw + "}} is not a name it knows");
                i++; CondNode n = new CondNode(); n.Op = "val"; n.P = k.P; return n;
            }
            if (k.T == "lit") { i++; CondNode n = new CondNode(); n.Op = "val"; n.Lit = k.V; return n; }
            if (Peek("("))
            {
                i++; CondNode e = Or();
                if (!Peek(")")) throw Bad("a ( with no )");
                i++; return e;
            }
            throw Bad("a value was expected");
        }
        CondNode Node(string op, string cmp, CondNode a, CondNode b) { CondNode n = new CondNode(); n.Op = op; n.Cmp = cmp; n.A = a; n.B = b; return n; }
        CondNode Cmp()
        {
            CondNode a = Atom();
            if (Peek("is"))
            {
                i++;
                bool neg = false;
                if (Peek("not")) { neg = true; i++; }
                if (!Peek("empty")) throw Bad("\"is\" is followed by \"empty\" or \"not empty\"");
                i++;
                CondNode n = Node("empty", "", a, null); n.Neg = neg; return n;
            }
            if (Peek("not") && i + 1 < t.Count && t[i + 1].T == "op" && t[i + 1].V == "contains")
            {
                i += 2;
                return Node("not", "", Node("cmp", "contains", a, Atom()), null);
            }
            if (Peek("starts") || Peek("ends"))
            {
                string which = t[i].V; i++;
                if (!Peek("with")) throw Bad("\"" + which + "\" is followed by \"with\"");
                i++;
                return Node("cmp", which, a, Atom());
            }
            foreach (string o in new string[] { "==", "!=", ">=", "<=", ">", "<", "contains" })
                if (Peek(o)) { i++; return Node("cmp", o, a, Atom()); }
            return a;
        }
        CondNode Not() { if (Peek("not")) { i++; return Node("not", "", Not(), null); } return Cmp(); }
        CondNode And() { CondNode a = Not(); while (Peek("and")) { i++; a = Node("and", "", a, Not()); } return a; }
        CondNode Or() { CondNode a = And(); while (Peek("or")) { i++; a = Node("or", "", a, And()); } return a; }
    }

    //  null when it was read, with its answer in result; else why not
    static string CondEval(string src, StepCtx c, Dictionary<string, string> extra, out bool result)
    {
        result = false;
        string lexErr;
        List<CondTok> toks = CondLex(src ?? "", out lexErr);
        if (toks == null) return lexErr;
        CondNode root;
        try { root = new CondParser(toks).Parse(); }
        catch (FormatException e) { return e.Message; }
        int before = c.Errors.Count;
        Func<Ph, string> look = delegate(Ph p)
        {
            string v;
            if (extra != null && p.Ns.Length == 0 && extra.TryGetValue(p.Full, out v)) return Filtered(v, p.Filters);
            v = Lookup(p, c, false);
            return v == null ? null : Filtered(v, p.Filters);
        };
        result = CondNodeEval(root, look);
        if (c.Errors.Count > before)
        {
            string e = c.Errors[c.Errors.Count - 1];
            c.Errors.RemoveRange(before, c.Errors.Count - before);
            return e;
        }
        return null;
    }

    static readonly Regex NumRe = new Regex(@"^\s*-?\d+(?:\.\d+)?\s*$");
    static bool Truthy(string v)
    {
        if (v == null) return false;
        string s = v.Trim();
        return s.Length > 0 && !Regex.IsMatch(s, "^(false|0|null|undefined|no)$", RegexOptions.IgnoreCase);
    }
    static string CondVal(CondNode n, Func<Ph, string> look)
    {
        if (n.Op == "val") return n.P != null ? look(n.P) : n.Lit;
        return CondNodeEval(n, look) ? "true" : "false";
    }
    static bool CondNodeEval(CondNode n, Func<Ph, string> look)
    {
        switch (n.Op)
        {
            case "or": return CondNodeEval(n.A, look) || CondNodeEval(n.B, look);
            case "and": return CondNodeEval(n.A, look) && CondNodeEval(n.B, look);
            case "not": return !CondNodeEval(n.A, look);
            case "val": return Truthy(n.P != null ? look(n.P) : n.Lit);
            case "empty":
            {
                string v = CondVal(n.A, look);
                bool e = v == null || v.Trim().Length == 0;
                return n.Neg ? !e : e;
            }
            case "cmp":
            {
                string a = CondVal(n.A, look), b = CondVal(n.B, look);
                string sa = a == null ? "" : a.Trim(), sb = b == null ? "" : b.Trim();
                bool nums = NumRe.IsMatch(sa) && NumRe.IsMatch(sb);
                double da = 0, db = 0;
                if (nums)
                {
                    da = double.Parse(sa, NumberStyles.Float, CultureInfo.InvariantCulture);
                    db = double.Parse(sb, NumberStyles.Float, CultureInfo.InvariantCulture);
                }
                string la = sa.ToLowerInvariant(), lb = sb.ToLowerInvariant();
                int c = string.CompareOrdinal(la, lb);
                switch (n.Cmp)
                {
                    case "==": return nums ? da == db : la == lb;
                    case "!=": return nums ? da != db : la != lb;
                    case ">": return nums ? da > db : c > 0;
                    case "<": return nums ? da < db : c < 0;
                    case ">=": return nums ? da >= db : c >= 0;
                    case "<=": return nums ? da <= db : c <= 0;
                    case "contains": return la.IndexOf(lb, StringComparison.Ordinal) >= 0;
                    case "starts": return la.StartsWith(lb, StringComparison.Ordinal);
                    case "ends": return la.EndsWith(lb, StringComparison.Ordinal);
                }
                return false;
            }
        }
        return false;
    }

    //  ── JSON, read and written ─────────────────────────────────────────────
    //  The few hundred lines a framework would bring, without the framework:
    //  numbers are kept as they were written (an id of twenty digits stays
    //  twenty digits), objects keep their order, and nothing nests deeper
    //  than 64.
    class JNum { public string Raw; public JNum(string r) { Raw = r; } }
    class JObj
    {
        public List<string> Keys = new List<string>();
        public Dictionary<string, object> Map = new Dictionary<string, object>();
        public void Set(string k, object v) { if (!Map.ContainsKey(k)) Keys.Add(k); Map[k] = v; }
        public bool Has(string k) { return Map.ContainsKey(k); }
        public object Get(string k) { object v; return Map.TryGetValue(k, out v) ? v : null; }
    }
    class JsonReader
    {
        string s; int i; int depth;
        public static object Parse(string text)
        {
            JsonReader r = new JsonReader();
            r.s = text ?? "";
            if (r.s.Length > 0 && r.s[0] == '\uFEFF') r.s = r.s.Substring(1);
            r.Ws();
            object v = r.Value();
            r.Ws();
            if (r.i != r.s.Length) throw new FormatException("there is more after the JSON, at " + r.i);
            return v;
        }
        void Ws() { while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\r' || s[i] == '\n')) i++; }
        object Value()
        {
            if (i >= s.Length) throw new FormatException("the JSON ends too soon");
            char c = s[i];
            if (c == '{') return Obj();
            if (c == '[') return Arr();
            if (c == '"') return Str();
            if (Lit("true")) return true;
            if (Lit("false")) return false;
            if (Lit("null")) return null;
            if (c == '-' || (c >= '0' && c <= '9')) return Num();
            throw new FormatException("\"" + c + "\" was not expected at " + i);
        }
        bool Lit(string w)
        {
            if (i + w.Length <= s.Length && string.CompareOrdinal(s, i, w, 0, w.Length) == 0) { i += w.Length; return true; }
            return false;
        }
        JObj Obj()
        {
            if (++depth > 64) throw new FormatException("the JSON is nested too deeply");
            JObj o = new JObj();
            i++; Ws();
            if (i < s.Length && s[i] == '}') { i++; depth--; return o; }
            while (true)
            {
                Ws();
                if (i >= s.Length || s[i] != '"') throw new FormatException("a name in quotes was expected at " + i);
                string k = Str();
                Ws();
                if (i >= s.Length || s[i] != ':') throw new FormatException("\":\" was expected at " + i);
                i++; Ws();
                o.Set(k, Value());
                Ws();
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == '}') { i++; break; }
                throw new FormatException("\",\" or \"}\" was expected at " + i);
            }
            depth--;
            return o;
        }
        List<object> Arr()
        {
            if (++depth > 64) throw new FormatException("the JSON is nested too deeply");
            List<object> a = new List<object>();
            i++; Ws();
            if (i < s.Length && s[i] == ']') { i++; depth--; return a; }
            while (true)
            {
                Ws();
                a.Add(Value());
                Ws();
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == ']') { i++; break; }
                throw new FormatException("\",\" or \"]\" was expected at " + i);
            }
            depth--;
            return a;
        }
        string Str()
        {
            StringBuilder b = new StringBuilder();
            i++;
            while (i < s.Length)
            {
                char c = s[i++];
                if (c == '"') return b.ToString();
                if (c != '\\') { b.Append(c); continue; }
                if (i >= s.Length) break;
                char e = s[i++];
                switch (e)
                {
                    case '"': b.Append('"'); break;
                    case '\\': b.Append('\\'); break;
                    case '/': b.Append('/'); break;
                    case 'b': b.Append('\b'); break;
                    case 'f': b.Append('\f'); break;
                    case 'n': b.Append('\n'); break;
                    case 'r': b.Append('\r'); break;
                    case 't': b.Append('\t'); break;
                    case 'u':
                        if (i + 4 > s.Length) throw new FormatException("a \\u escape is cut short");
                        b.Append((char)Convert.ToInt32(s.Substring(i, 4), 16));
                        i += 4;
                        break;
                    default: throw new FormatException("\\" + e + " is not an escape JSON has");
                }
            }
            throw new FormatException("a string in the JSON does not end");
        }
        JNum Num()
        {
            int st = i;
            if (s[i] == '-') i++;
            while (i < s.Length && "0123456789.eE+-".IndexOf(s[i]) >= 0) i++;
            string raw = s.Substring(st, i - st);
            double d;
            if (!double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out d))
                throw new FormatException("\"" + raw + "\" is not a number");
            return new JNum(raw);
        }
    }

    static string JsonOf(object v)
    {
        if (v == null) return "null";
        if (v is string) return Json((string)v);
        if (v is bool) return (bool)v ? "true" : "false";
        JNum n = v as JNum;
        if (n != null) return n.Raw;
        JObj o = v as JObj;
        if (o != null)
        {
            StringBuilder b = new StringBuilder("{");
            for (int i = 0; i < o.Keys.Count; i++)
                b.Append(i > 0 ? "," : "").Append(Json(o.Keys[i])).Append(':').Append(JsonOf(o.Map[o.Keys[i]]));
            return b.Append('}').ToString();
        }
        List<object> a = v as List<object>;
        if (a != null)
        {
            StringBuilder b = new StringBuilder("[");
            for (int i = 0; i < a.Count; i++) b.Append(i > 0 ? "," : "").Append(JsonOf(a[i]));
            return b.Append(']').ToString();
        }
        return Json(v.ToString());
    }

    //  a value as text: a string as it is, a number as it was written,
    //  anything bigger as its JSON
    static string TextOf(object v)
    {
        if (v == null) return "";
        if (v is string) return (string)v;
        if (v is bool) return (bool)v ? "true" : "false";
        JNum n = v as JNum;
        if (n != null) return n.Raw;
        return JsonOf(v);
    }

    static string JsonList(List<string> l)
    {
        StringBuilder b = new StringBuilder("[");
        for (int i = 0; i < l.Count; i++) b.Append(i > 0 ? "," : "").Append(Json(l[i]));
        return b.Append(']').ToString();
    }

    //  "coi.files[0].url", "$.data.token", "items.0.id", ["odd key"]
    static List<string> JsonPathParts(string path)
    {
        string p = (path ?? "").Trim();
        if (p.StartsWith("$")) { p = p.Substring(1); if (p.StartsWith(".")) p = p.Substring(1); }
        List<string> parts = new List<string>();
        int i = 0;
        while (i < p.Length)
        {
            if (p[i] == '.') { i++; continue; }
            if (p[i] == '[')
            {
                int j = p.IndexOf(']', i);
                if (j < 0) return null;
                string k = p.Substring(i + 1, j - i - 1).Trim();
                if (k.Length >= 2 && (k[0] == '"' || k[0] == '\'') && (k[k.Length - 1] == '"' || k[k.Length - 1] == '\'')) k = k.Substring(1, k.Length - 2);
                parts.Add(k);
                i = j + 1;
                continue;
            }
            int e = i;
            while (e < p.Length && p[e] != '.' && p[e] != '[') e++;
            parts.Add(p.Substring(i, e - i));
            i = e;
        }
        return parts;
    }

    static bool JsonAt(object root, string path, out object found)
    {
        found = null;
        List<string> parts = JsonPathParts(path);
        if (parts == null) return false;
        object cur = root;
        foreach (string k in parts)
        {
            JObj o = cur as JObj;
            List<object> a = cur as List<object>;
            if (o != null) { if (!o.Has(k)) return false; cur = o.Get(k); }
            else if (a != null)
            {
                int n;
                if (!Regex.IsMatch(k, "^[0-9]+$") || !int.TryParse(k, out n) || n >= a.Count) return false;
                cur = a[n];
            }
            else return false;
        }
        found = cur;
        return true;
    }

    static string JS(JObj o, string k) { if (o == null) return ""; object v = o.Get(k); return v == null ? "" : TextOf(v); }
    static bool JB(JObj o, string k) { if (o == null) return false; object v = o.Get(k); return v is bool && (bool)v; }
    static JObj JO(JObj o, string k) { return o == null ? null : o.Get(k) as JObj; }
    static List<object> JA(JObj o, string k) { List<object> a = o == null ? null : o.Get(k) as List<object>; return a ?? new List<object>(); }
    static int JN(JObj o, string k, int d)
    {
        double v;
        string s = JS(o, k);
        return s.Length > 0 && double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out v) ? (int)Math.Round(v) : d;
    }

    //  a JSON object, written a field at a time
    class JOut
    {
        StringBuilder b = new StringBuilder("{");
        bool first = true;
        JOut K(string k) { if (!first) b.Append(','); first = false; b.Append(Json(k)).Append(':'); return this; }
        public JOut S(string k, string v) { K(k); b.Append(Json(v ?? "")); return this; }
        public JOut N(string k, long v) { K(k); b.Append(v); return this; }
        public JOut B(string k, bool v) { K(k); b.Append(v ? "true" : "false"); return this; }
        public JOut Raw(string k, string json) { K(k); b.Append(json); return this; }
        public override string ToString() { return b.ToString() + "}"; }
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
