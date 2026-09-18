/* ===========================================================================
   dbo.LoadWorkspace - one workspace in, every table out
   ---------------------------------------------------------------------------
   The only code that writes the tables, called by two things:

     the bridge   every time Dossier saves, which is every change you make
     push.sql     when a dossier.json is loaded from disk

   One implementation, so the two can never drift. Its own file because
   CREATE PROCEDURE has to be the first statement in its batch, and wrapping
   a body this size in EXEC(N'...') means doubling every quote in it - which
   is a bug waiting to happen and hard to read besides.

   It does not open a transaction. Its callers do, because they have things
   to write alongside it.
   =========================================================================== */

SET NOCOUNT ON;
GO

CREATE OR ALTER PROCEDURE dbo.LoadWorkspace
    @doc nvarchar(max)
AS
BEGIN
    SET NOCOUNT ON;

    IF @doc IS NULL OR ISJSON(@doc) <> 1
        THROW 50001, 'LoadWorkspace was handed something that is not JSON.', 1;
    IF JSON_VALUE(@doc, '$.app') <> 'dossier'
        THROW 50002, 'LoadWorkspace was handed JSON that is not a Dossier workspace.', 1;

    /* the current state of things, whole. Reads come from here, so nothing
       has to be reassembled out of the columns below and no field can be
       quietly lost by a shred that forgot it. */
    IF EXISTS (SELECT 1 FROM dbo.Workspace WHERE Id = 1)
        UPDATE dbo.Workspace SET Doc = @doc, UpdatedAt = SYSUTCDATETIME(),
               Records = (SELECT COUNT(*) FROM OPENJSON(@doc, '$.tasks')) WHERE Id = 1;
    ELSE
        INSERT dbo.Workspace (Id, Doc, UpdatedAt, Records)
        VALUES (1, @doc, SYSUTCDATETIME(), (SELECT COUNT(*) FROM OPENJSON(@doc, '$.tasks')));

    /* and the same thing in columns, for querying */
    DELETE dbo.RecordBlocker;
    DELETE dbo.RecordTag;
    DELETE dbo.RecordStep;
    DELETE dbo.RecordFile;
    DELETE dbo.RecordLog;
    DELETE dbo.Record;
    DELETE dbo.Routine;
    DELETE dbo.Script;
    DELETE dbo.Setting;

    INSERT dbo.Record (Id, Code, Title, Notes, Status, Priority, System, Type, Ticket,
                       Requester, Folder, WaitOn, WaitNote, WaitSince, WaitUntil, AutoBlocked,
                       Created, Due, DueTime, Started, Completed, EstimateMins, SpentMins,
                       Carried, FromRoutine, ForDate)
    SELECT t.id, t.code, t.title, t.notes, t.status, t.priority, t.system, t.type, t.ticket,
           t.requester, t.folder, t.waitOn, t.waitNote, t.waitSince, t.waitUntil,
           CASE WHEN t.autoBlocked = 'true' THEN 1 ELSE 0 END,
           TRY_CONVERT(datetime2(0), t.created), TRY_CONVERT(date, NULLIF(t.due, '')),
           t.dueTime, TRY_CONVERT(datetime2(0), NULLIF(t.started, '')),
           TRY_CONVERT(datetime2(0), NULLIF(t.completed, '')),
           TRY_CONVERT(int, t.estimate), TRY_CONVERT(float, t.spent),
           TRY_CONVERT(int, t.carried), t.fromRoutine, t.forDate
    FROM OPENJSON(@doc, '$.tasks') WITH (
            id          nvarchar(40)  '$.id',
            code        nvarchar(20)  '$.code',
            title       nvarchar(400) '$.title',
            notes       nvarchar(max) '$.notes',
            status      nvarchar(20)  '$.status',
            priority    nvarchar(4)   '$.priority',
            system      nvarchar(120) '$.system',
            type        nvarchar(60)  '$.type',
            ticket      nvarchar(60)  '$.ticket',
            requester   nvarchar(200) '$.requester',
            folder      nvarchar(400) '$.folder',
            waitOn      nvarchar(200) '$.waitOn',
            waitNote    nvarchar(max) '$.waitNote',
            waitSince   nvarchar(30)  '$.waitSince',
            waitUntil   nvarchar(30)  '$.waitUntil',
            autoBlocked nvarchar(10)  '$.autoBlocked',
            created     nvarchar(40)  '$.created',
            due         nvarchar(20)  '$.due',
            dueTime     nvarchar(10)  '$.dueTime',
            started     nvarchar(40)  '$.started',
            completed   nvarchar(40)  '$.completed',
            estimate    nvarchar(20)  '$.estimate',
            spent       nvarchar(30)  '$.spent',
            carried     nvarchar(10)  '$.carried',
            fromRoutine nvarchar(60)  '$.fromRoutine',
            forDate     nvarchar(30)  '$.forDate'
         ) AS t
    WHERE t.id IS NOT NULL;

    INSERT dbo.RecordLog (RecordId, At, Kind, Text)
    SELECT r.id, TRY_CONVERT(datetime2(0), l.at), l.kind, l.text
    FROM OPENJSON(@doc, '$.tasks') WITH (id nvarchar(40) '$.id', log nvarchar(max) '$.log' AS JSON) AS r
    CROSS APPLY OPENJSON(r.log) WITH (at nvarchar(40) '$.at', kind nvarchar(30) '$.kind',
                                      text nvarchar(max) '$.text') AS l;

    INSERT dbo.RecordFile (RecordId, Name, Bytes, Type, Added)
    SELECT r.id, f.name, TRY_CONVERT(bigint, f.size), f.type, TRY_CONVERT(datetime2(0), f.added)
    FROM OPENJSON(@doc, '$.tasks') WITH (id nvarchar(40) '$.id', files nvarchar(max) '$.files' AS JSON) AS r
    CROSS APPLY OPENJSON(r.files) WITH (name nvarchar(400) '$.name', size nvarchar(30) '$.size',
                                        type nvarchar(120) '$.type', added nvarchar(40) '$.added') AS f;

    INSERT dbo.RecordStep (RecordId, Ordinal, Text, Done)
    SELECT r.id, CAST(c.[key] AS int), c.text, CASE WHEN c.done = 'true' THEN 1 ELSE 0 END
    FROM OPENJSON(@doc, '$.tasks') WITH (id nvarchar(40) '$.id', checklist nvarchar(max) '$.checklist' AS JSON) AS r
    CROSS APPLY OPENJSON(r.checklist) AS c0
    CROSS APPLY (SELECT c0.[key] AS [key],
                        CASE WHEN ISJSON(c0.value) = 1 THEN JSON_VALUE(c0.value, '$.text')
                             ELSE c0.value END AS text,
                        CASE WHEN ISJSON(c0.value) = 1 THEN JSON_VALUE(c0.value, '$.done')
                             ELSE 'false' END AS done) AS c;

    INSERT dbo.RecordTag (RecordId, Tag)
    SELECT DISTINCT r.id, g.value
    FROM OPENJSON(@doc, '$.tasks') WITH (id nvarchar(40) '$.id', tags nvarchar(max) '$.tags' AS JSON) AS r
    CROSS APPLY OPENJSON(r.tags) AS g
    WHERE g.value IS NOT NULL AND g.value <> '';

    INSERT dbo.RecordBlocker (RecordId, BlockedBy)
    SELECT DISTINCT r.id, b.value
    FROM OPENJSON(@doc, '$.tasks') WITH (id nvarchar(40) '$.id', blockedBy nvarchar(max) '$.blockedBy' AS JSON) AS r
    CROSS APPLY OPENJSON(r.blockedBy) AS b
    WHERE b.value IS NOT NULL AND b.value <> '';

    INSERT dbo.Routine (Id, Title, Freq, AutoRun, Doc)
    SELECT x.id, x.title, x.freq, CASE WHEN x.autoRun = 'true' THEN 1 ELSE 0 END, x.doc
    FROM OPENJSON(@doc, '$.routines') WITH (
            id nvarchar(40) '$.id', title nvarchar(400) '$.title', freq nvarchar(30) '$.freq',
            autoRun nvarchar(10) '$.autoRun', doc nvarchar(max) '$' AS JSON) AS x
    WHERE x.id IS NOT NULL;

    INSERT dbo.Script (Id, Name, FileName, Descr)
    SELECT x.id, x.name, x.fileName, x.descr
    FROM OPENJSON(@doc, '$.scripts') WITH (
            id nvarchar(40) '$.id', name nvarchar(200) '$.name',
            fileName nvarchar(400) '$.file', descr nvarchar(max) '$.desc') AS x
    WHERE x.id IS NOT NULL;

    /* -- the library, the history and the conversations -------------------------
       Runbooks, profiles and notes live inside settings in the file; incidents
       and chats are top-level. All of them are replaced wholesale on a push, the
       same as the records: the file is the truth, this is the copy of it you can
       query. */
    DELETE dbo.RunbookTrigger;
    DELETE dbo.RunbookStep;
    DELETE dbo.Runbook;
    DELETE dbo.SystemProfile;
    DELETE dbo.Note;
    DELETE dbo.Incident;
    DELETE dbo.ChatMessage;
    DELETE dbo.Chat;
    DELETE dbo.Holiday;

    INSERT dbo.Runbook (Title, System, Severity, Status, Owner, Verified, Uses, Escalation, Checks)
    SELECT b.title, b.system, b.severity, b.status, b.owner, b.verified,
           TRY_CONVERT(int, b.uses), b.escalation, b.checks
    FROM OPENJSON(@doc, '$.settings.runbooks') WITH (
            title      nvarchar(400) '$.title',
            system     nvarchar(120) '$.system',
            severity   nvarchar(4)   '$.severity',
            status     nvarchar(30)  '$.status',
            owner      nvarchar(200) '$.owner',
            verified   nvarchar(40)  '$.verified',
            uses       nvarchar(20)  '$.uses',
            escalation nvarchar(max) '$.escalation',
            checks     nvarchar(max) '$.checks'
         ) AS b
    WHERE b.title IS NOT NULL AND b.title <> '';

    INSERT dbo.RunbookTrigger (RunbookId, Ordinal, Phrase)
    SELECT r.RunbookId, CAST(g.[key] AS int), g.value
    FROM OPENJSON(@doc, '$.settings.runbooks') WITH (
            title nvarchar(400) '$.title', triggers nvarchar(max) '$.triggers' AS JSON) AS b
    JOIN dbo.Runbook r ON r.Title = b.title
    CROSS APPLY OPENJSON(b.triggers) AS g
    WHERE g.value IS NOT NULL AND g.value <> '';

    INSERT dbo.RunbookStep (RunbookId, Ordinal, Text)
    SELECT r.RunbookId, CAST(g.[key] AS int), g.value
    FROM OPENJSON(@doc, '$.settings.runbooks') WITH (
            title nvarchar(400) '$.title', steps nvarchar(max) '$.steps' AS JSON) AS b
    JOIN dbo.Runbook r ON r.Title = b.title
    CROSS APPLY OPENJSON(b.steps) AS g
    WHERE g.value IS NOT NULL AND g.value <> '';

    INSERT dbo.SystemProfile (System, Facts, Quirks, Tables, Owner, Updated)
    SELECT p.system, p.facts, p.quirks, p.tables, p.owner, TRY_CONVERT(datetime2(0), p.updated)
    FROM OPENJSON(@doc, '$.settings.profiles') WITH (
            system  nvarchar(120) '$.system',
            facts   nvarchar(max) '$.facts',
            quirks  nvarchar(max) '$.quirks',
            tables  nvarchar(max) '$.tables',
            owner   nvarchar(200) '$.owner',
            updated nvarchar(40)  '$.updated'
         ) AS p
    WHERE p.system IS NOT NULL AND p.system <> '';

    INSERT dbo.Note (Id, Title, Body, System, Tags, Created, Updated)
    SELECT n.id, n.title, n.body, n.system, n.tags,
           TRY_CONVERT(datetime2(0), n.created), TRY_CONVERT(datetime2(0), n.updated)
    FROM OPENJSON(@doc, '$.settings.memory') WITH (
            id      nvarchar(60)  '$.id',
            title   nvarchar(400) '$.title',
            body    nvarchar(max) '$.body',
            system  nvarchar(120) '$.system',
            tags    nvarchar(max) '$.tags' AS JSON,   /* AS JSON needs max */
            created nvarchar(40)  '$.created',
            updated nvarchar(40)  '$.updated'
         ) AS n
    WHERE n.id IS NOT NULL;

    INSERT dbo.Incident (Num, Opened, Resolved, Closed, Title, Descr, Sys, Ci, Cat, Sub,
                         [Group], Who, Caller, Pri, State, CloseCode, CloseNotes, Cause, Reopens)
    SELECT i.num, TRY_CONVERT(datetime2(0), i.opened), TRY_CONVERT(datetime2(0), i.resolved),
           TRY_CONVERT(datetime2(0), i.closed), i.title, i.descr, i.sys, i.ci, i.cat, i.sub,
           i.grp, i.who, i.caller, i.pri, i.state, i.closeCode, i.closeNotes, i.cause,
           TRY_CONVERT(int, i.reopens)
    FROM OPENJSON(@doc, '$.incidents') WITH (
            num        nvarchar(40)  '$.num',
            opened     nvarchar(40)  '$.opened',
            resolved   nvarchar(40)  '$.resolved',
            closed     nvarchar(40)  '$.closed',
            title      nvarchar(400) '$.title',
            descr      nvarchar(max) '$.desc',
            sys        nvarchar(160) '$.sys',
            ci         nvarchar(160) '$.ci',
            cat        nvarchar(120) '$.cat',
            sub        nvarchar(120) '$.sub',
            grp        nvarchar(160) '$.group',
            who        nvarchar(160) '$.who',
            caller     nvarchar(160) '$.caller',
            pri        nvarchar(10)  '$.pri',
            state      nvarchar(60)  '$.state',
            closeCode  nvarchar(120) '$.closeCode',
            closeNotes nvarchar(max) '$.closeNotes',
            cause      nvarchar(max) '$.cause',
            reopens    nvarchar(10)  '$.reopens'
         ) AS i
    WHERE i.num IS NOT NULL;

    INSERT dbo.Chat (Id, Title, Created, Updated, Messages)
    SELECT c.id, c.title, TRY_CONVERT(datetime2(0), c.created),
           TRY_CONVERT(datetime2(0), c.updated),
           (SELECT COUNT(*) FROM OPENJSON(c.msgs))
    FROM OPENJSON(@doc, '$.chats') WITH (
            id      nvarchar(60)  '$.id',
            title   nvarchar(400) '$.title',
            created nvarchar(40)  '$.created',
            updated nvarchar(40)  '$.updated',
            msgs    nvarchar(max) '$.msgs' AS JSON
         ) AS c
    WHERE c.id IS NOT NULL;

    /* A message is either something you typed, something it answered, or the
       line left behind by something it did. The answer is an object; what it
       said is the part worth a column, and the rest stays in the snapshot. */
    INSERT dbo.ChatMessage (ChatId, Ordinal, Who, Text)
    SELECT c.id, CAST(m.[key] AS int),
           JSON_VALUE(m.value, '$.who'),
           COALESCE(JSON_VALUE(m.value, '$.text'), JSON_VALUE(m.value, '$.reply.say'))
    FROM OPENJSON(@doc, '$.chats') WITH (
            id nvarchar(60) '$.id', msgs nvarchar(max) '$.msgs' AS JSON) AS c
    CROSS APPLY OPENJSON(c.msgs) AS m;

    INSERT dbo.Holiday ([Date], Name, Kind)
    SELECT TRY_CONVERT(date, h.d), h.n, h.k
    FROM OPENJSON(@doc, '$.settings.holidays') WITH (
            d nvarchar(20) '$.d', n nvarchar(200) '$.n', k nvarchar(40) '$.k') AS h
    WHERE TRY_CONVERT(date, h.d) IS NOT NULL;

    /* settings are a bag of anything, so they are kept as key/value with the
       nested ones left as the JSON they are */
    INSERT dbo.Setting ([Key], Value)
    SELECT s.[key], s.value
    FROM OPENJSON(@doc, '$.settings') AS s
    WHERE s.[key] NOT IN ('runbooks', 'profiles', 'memory', 'holidays');
END
GO
