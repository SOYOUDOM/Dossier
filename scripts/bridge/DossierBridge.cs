// ===========================================================================
//  DossierBridge - the one process between the page and the database.
//
//  Dossier is a page in a browser. A browser has no SQL client and never
//  will, so it cannot open a connection to SQL Server; this listens on
//  127.0.0.1, speaks JSON to the page and T-SQL to LocalDB, and that is the
//  whole of its job. Every change you make in Dossier becomes a transaction
//  in here.
//
//  IT ALSO HANDS OUT THE PAGE
//  Chrome and Edge refuse notification permission to a page opened from
//  file://, which is the only reason dossier-serve.bat ever existed. This
//  already is an HTTP server on 127.0.0.1, so it serves the page too: one
//  window instead of two, and the page ends up on the same origin as the
//  API it calls, which retires the CORS preflight as well.
//
//  WHAT IT IS NOT
//  It is not a web server you would put anything on. It binds the loopback
//  address only; it serves read-only GETs of a short list of file types out
//  of the folder dossier.html sits in, and nothing from your workspace; and
//  every route that touches the database carries a token generated fresh
//  each time it starts. That token is written into your workspace folder,
//  which the page already has a handle on, and nowhere else - so the page
//  can drive it and nothing else on the machine can.
//
//  WRITTEN FOR THE COMPILER ALREADY ON THE MACHINE
//  C# 5, because scripts\dossier-bridge.bat builds this with the csc.exe
//  that ships in C:\Windows\Microsoft.NET\Framework64\v4.0.30319 rather than
//  asking anybody to install a toolchain. So: no string interpolation, no
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
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

public class DossierBridge
{
    static string Token;
    static string ConnectionString;
    static string Database = "Dossier";
    static string Server = @"(localdb)\MSSQLLocalDB";
    static int Port;
    static string AppRoot;              // the folder dossier.html sits in
    static int Wanted = 5500;           // the port dossier-serve.bat used

    public static int Main(string[] args)
    {
        // argv: <workspace folder> [server] [database] [folder holding dossier.html]
        if (args.Length < 1)
        {
            Console.Error.WriteLine("usage: DossierBridge <workspace folder> [server] [database] [app folder]");
            return 2;
        }
        string folder = args[0];
        if (args.Length > 1 && args[1].Length > 0) Server = args[1];
        if (args.Length > 2 && args[2].Length > 0) Database = args[2];
        if (args.Length > 3 && args[3].Length > 0) AppRoot = args[3];

        // Where the page lives. The exe is built into scripts\bridge, so two
        // folders up is the clone unless somebody says otherwise.
        if (AppRoot == null)
        {
            string here = Path.GetDirectoryName(
                System.Reflection.Assembly.GetExecutingAssembly().Location);
            AppRoot = Path.GetFullPath(Path.Combine(here, ".." + Path.DirectorySeparatorChar + ".."));
        }
        AppRoot = Path.GetFullPath(AppRoot);
        if (!File.Exists(Path.Combine(AppRoot, "dossier.html")))
        {
            Console.WriteLine("  note      no dossier.html in " + AppRoot);
            Console.WriteLine("            so this will not hand out the page; open it yourself.");
            AppRoot = null;
        }

        string wanted = Environment.GetEnvironmentVariable("DOSSIER_PORT");
        if (wanted != null && wanted.Length > 0) int.TryParse(wanted, out Wanted);

        if (!Directory.Exists(folder))
        {
            Console.Error.WriteLine("No such folder: " + folder);
            return 3;
        }

        // The folder has to be the one you pick in Dossier's "Choose
        // workspace folder", and the commonest mistake is to start this in
        // the clone instead - where it writes a handshake nothing will ever
        // read, and Dossier goes on quietly using a file. Refuse rather than
        // succeed somewhere useless.
        bool looksLikeClone = File.Exists(Path.Combine(folder, "dossier.html")) ||
                              Directory.Exists(Path.Combine(folder, ".git"));
        bool looksLikeWorkspace = File.Exists(Path.Combine(folder, "dossier.json")) ||
                                  File.Exists(Path.Combine(folder, ".bridge.json")) ||
                                  Directory.Exists(Path.Combine(folder, "tasks"));
        if (looksLikeClone && !looksLikeWorkspace)
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine("  That folder looks like the Dossier repository, not a workspace:");
            Console.Error.WriteLine("    " + folder);
            Console.Error.WriteLine();
            Console.Error.WriteLine("  A workspace is the folder you pick in Dossier's");
            Console.Error.WriteLine("  \"Choose workspace folder\" - the one with your dossier.json in it.");
            Console.Error.WriteLine("  Start the bridge on that one:");
            Console.Error.WriteLine();
            Console.Error.WriteLine("    dossier-bridge.bat \"C:\\path\\to\\your\\workspace\"");
            Console.Error.WriteLine();
            return 5;
        }

        ConnectionString = "Server=" + Server + ";Database=" + Database +
                           ";Integrated Security=true;MultipleActiveResultSets=true;" +
                           "Connect Timeout=30;Application Name=DossierBridge";

        try
        {
            using (SqlConnection c = new SqlConnection(ConnectionString))
            {
                c.Open();
                using (SqlCommand cmd = new SqlCommand("SELECT Version FROM dbo.SchemaVersion WHERE Id = 1", c))
                {
                    object v = cmd.ExecuteScalar();
                    Console.WriteLine("  database  " + Database + " on " + Server + ", schema version " + v);
                }
                // Everything this process writes goes through one procedure.
                // Finding out it is missing at the first save means nine
                // failed writes and a person wondering why nothing happened;
                // finding out here means one line and a fix.
                using (SqlCommand cmd = new SqlCommand(
                    "SELECT OBJECT_ID('dbo.LoadWorkspace', 'P')", c))
                {
                    object p = cmd.ExecuteScalar();
                    if (p == null || p == DBNull.Value)
                    {
                        Console.Error.WriteLine();
                        Console.Error.WriteLine("  The loader dbo.LoadWorkspace is not in this database.");
                        Console.Error.WriteLine("  Nothing could be saved. Create it with:");
                        Console.Error.WriteLine();
                        Console.Error.WriteLine("      scripts\\dossier-sql.bat init");
                        Console.Error.WriteLine();
                        return 6;
                    }
                }
            }
        }
        catch (Exception e)
        {
            Console.Error.WriteLine("Could not open the database: " + e.Message);
            Console.Error.WriteLine("Run scripts\\dossier-sql.bat init first.");
            return 4;
        }

        Token = Guid.NewGuid().ToString("N");
        // The page's address wants to stay the same between runs: a browser
        // keeps the handle on your workspace folder per origin, and a new
        // port is a new origin, so a port that moved means picking the folder
        // again. 5500 is what dossier-serve.bat used, so anyone coming from
        // that keeps their handle and notices nothing.
        TcpListener listener = Bind(AppRoot == null ? 0 : Wanted, out Port);

        // How the page finds us. It holds a handle on this folder already, so
        // this is the one channel that needs no configuration - and a file
        // only readable by somebody who can already read the records.
        string handshake = "{\"port\":" + Port + ",\"token\":\"" + Token + "\",\"database\":" +
                           Json(Database) + ",\"server\":" + Json(Server) +
                           ",\"started\":" + Json(DateTime.UtcNow.ToString("o")) + "}";
        string handshakePath = Path.Combine(folder, ".bridge.json");
        File.WriteAllText(handshakePath, handshake, new UTF8Encoding(false));

        string url = "http://127.0.0.1:" + Port + "/dossier.html";
        Console.WriteLine("  workspace " + folder);
        Console.WriteLine("  listening 127.0.0.1:" + Port);
        Console.WriteLine("  handshake " + handshakePath);
        if (AppRoot != null)
        {
            Console.WriteLine("  serving   " + AppRoot);
            Console.WriteLine();
            Console.WriteLine("  Dossier is at " + url);
            Console.WriteLine("  Bookmark that. There is nothing else to start - this window");
            Console.WriteLine("  is the app and the database both.");
            if (Port != Wanted)
            {
                Console.WriteLine();
                Console.WriteLine("  Port " + Wanted + " was taken, so this is on " + Port + " instead. A browser");
                Console.WriteLine("  counts that as a different address, so Dossier will ask for");
                Console.WriteLine("  your workspace folder once more. If dossier-serve.bat is still");
                Console.WriteLine("  running, close it - the bridge does that job now - and start");
                Console.WriteLine("  this again to get " + Wanted + " back.");
            }
        }
        Console.WriteLine();
        Console.WriteLine("  Dossier's footer will say SQL Server once you reopen this");
        Console.WriteLine("  folder. If it still says dossier.json, the folder above is");
        Console.WriteLine("  not the one you picked in Dossier.");
        Console.WriteLine();
        Console.WriteLine("  Leave this window open; closing it stops the bridge, and");
        Console.WriteLine("  Dossier will say so rather than save somewhere else.");
        Console.WriteLine();

        // Open it, unless something started us in the background on purpose -
        // the login-time launcher sets this, because a browser window nobody
        // asked for is a bad way to say good morning.
        if (AppRoot != null && Environment.GetEnvironmentVariable("DOSSIER_OPEN") != "0")
        {
            try { Process.Start(url); }
            catch (Exception) { Console.WriteLine("  Could not open a browser. Go to " + url); }
        }

        AppDomain.CurrentDomain.ProcessExit += delegate { TryDelete(handshakePath); };
        Console.CancelKeyPress += delegate { TryDelete(handshakePath); };

        while (true)
        {
            TcpClient client = listener.AcceptTcpClient();
            ThreadPool.QueueUserWorkItem(delegate(object state) { Serve((TcpClient)state); }, client);
        }
    }

    static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); }
        catch (Exception) { }
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

                // The page itself and the few files beside it. A browser
                // fetching a page cannot be told to carry a token, so these
                // are open - and they are read-only GETs of a short list of
                // file types out of the folder dossier.html sits in, which is
                // a checkout of a public repository. Your records are not in
                // that folder, and nothing below will serve them if they are.
                bool api = (path == "/health" || path == "/workspace" || path == "/attachment");
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
                    if (method == "GET" && path == "/health") { Health(net); return; }
                    if (method == "GET" && path == "/workspace") { GetWorkspace(net); return; }
                    if (method == "PUT" && path == "/workspace") { PutWorkspace(net, body); return; }
                    if (method == "POST" && path == "/attachment") { PostAttachment(net, headers, body); return; }
                    if (method == "GET" && path == "/attachment") { GetAttachment(net, query); return; }
                    if (method == "DELETE" && path == "/attachment") { DeleteAttachment(net, query); return; }
                    Respond(net, 404, "application/json", Bytes("{\"error\":\"no such route\"}"));
                }
                catch (Exception e)
                {
                    Console.Error.WriteLine("  ! " + method + " " + path + ": " + e.Message);
                    Respond(net, 500, "application/json",
                            Bytes("{\"error\":" + Json(e.Message) + "}"));
                }
            }
        }
        catch (Exception) { /* a dropped connection is not news */ }
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
        Respond(net, status, type, payload, false);
    }

    static void Respond(NetworkStream net, int status, string type, byte[] payload, bool headOnly)
    {
        StringBuilder h = new StringBuilder();
        h.Append("HTTP/1.1 ").Append(status).Append(" ").Append(StatusText(status)).Append("\r\n");
        // The page is opened from file://, whose origin is "null". Nothing
        // else can use these routes without the token anyway.
        h.Append("Access-Control-Allow-Origin: *\r\n");
        h.Append("Access-Control-Allow-Headers: content-type, x-dossier-token, x-name, x-type, x-record\r\n");
        h.Append("Access-Control-Allow-Methods: GET, PUT, POST, DELETE, OPTIONS\r\n");
        h.Append("Access-Control-Max-Age: 600\r\n");
        // Chrome's private network access checks ask for this by name when a
        // page reaches a loopback address; without it the preflight fails and
        // the page sees a network error it cannot explain.
        h.Append("Access-Control-Allow-Private-Network: true\r\n");
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
        if (s == 500) return "Internal Server Error";
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
        using (SqlConnection c = Open())
        {
            object ver = Scalar(c, "SELECT Version FROM dbo.SchemaVersion WHERE Id = 1");
            object recs = Scalar(c, "SELECT ISNULL(Records, 0) FROM dbo.Workspace WHERE Id = 1");
            object at = Scalar(c, "SELECT CONVERT(varchar(33), UpdatedAt, 126) FROM dbo.Workspace WHERE Id = 1");
            string json = "{\"ok\":true,\"database\":" + Json(Database) + ",\"server\":" + Json(Server) +
                          ",\"schema\":" + (ver == null ? "0" : ver.ToString()) +
                          ",\"records\":" + (recs == null ? "0" : recs.ToString()) +
                          ",\"updated\":" + Json(at == null ? "" : at.ToString()) + "}";
            Respond(net, 200, "application/json", Bytes(json));
        }
    }

    static void GetWorkspace(NetworkStream net)
    {
        using (SqlConnection c = Open())
        {
            object doc = Scalar(c, "SELECT Doc FROM dbo.Workspace WHERE Id = 1");
            if (doc == null || doc == DBNull.Value)
            {
                // an empty database is not an error; it is a new workspace
                Respond(net, 200, "application/json", Bytes("{\"empty\":true}"));
                return;
            }
            Respond(net, 200, "application/json", Bytes(doc.ToString()));
        }
    }

    // Everything Dossier writes comes through here, and it is one
    // transaction: the whole workspace, and every table derived from it,
    // or none of it.
    static void PutWorkspace(NetworkStream net, byte[] body)
    {
        string doc = new UTF8Encoding(false).GetString(body);
        if (doc.Length == 0)
        {
            Respond(net, 400, "application/json", Bytes("{\"error\":\"empty body\"}"));
            return;
        }
        using (SqlConnection c = Open())
        using (SqlTransaction tx = c.BeginTransaction())
        {
            try
            {
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
            object recs = Scalar(c, "SELECT ISNULL(Records, 0) FROM dbo.Workspace WHERE Id = 1");
            Respond(net, 200, "application/json",
                    Bytes("{\"ok\":true,\"records\":" + (recs == null ? "0" : recs.ToString()) + "}"));
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
