/* ===========================================================================
   Dossier in SQL Server LocalDB
   ---------------------------------------------------------------------------
   Creates the database, creates or migrates the tables, and loads a
   dossier.json into them. Idempotent: running it twice does nothing the
   second time except load the file again.

   It is driven by scripts\dossier-sql.bat; you can also run it by hand:

       sqlcmd -S "(localdb)\MSSQLLocalDB" -b -i sql\dossier.sql ^
              -v db="Dossier" file="C:\path\to\dossier.json" mode="push"

   mode is one of:
     init    create the database and bring the tables up to date, nothing else
     push    the above, then load the file into the tables
     check   print what is in there

   -- what the shape is ------------------------------------------------------
   Two things live here and they answer different questions.

   Snapshot holds the file, whole, exactly as it was written - one row per
   push, kept forever. That is what a restore reads, so a round trip through
   this database can never mangle a field nobody thought to shred, and a
   `pull` is a copy rather than a reconstruction.

   Every other table is that same JSON shredded into columns, replaced on
   each push, and it exists so you can ask SQL questions of your own work:
   how long P1s sit open, which system is costing the most hours, what came
   back on a Monday. Nothing in Dossier reads them. They are yours.
   =========================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

:on error exit

/* -- the database --------------------------------------------------------- */
IF DB_ID('$(db)') IS NULL
BEGIN
    PRINT 'creating database $(db)';
    DECLARE @sql nvarchar(400) = N'CREATE DATABASE [$(db)]';
    EXEC (@sql);
END
ELSE
    PRINT 'database $(db) is already here';
GO

USE [$(db)];
GO

/* OPENJSON - which the whole load is built on - is refused below
   compatibility level 130. A database created on any modern LocalDB
   inherits 150 or 160 from model and this does nothing; one restored from
   somewhere older would fail at the first shred without it. */
IF (SELECT compatibility_level FROM sys.databases WHERE name = DB_NAME()) < 130
BEGIN
    PRINT 'raising compatibility level to 130 for OPENJSON';
    DECLARE @lift nvarchar(200) = N'ALTER DATABASE [' + DB_NAME() + N'] SET COMPATIBILITY_LEVEL = 130';
    EXEC (@lift);
END
GO

/* -- migrations -------------------------------------------------------------
   One table with one number in it. Every step below is wrapped in a test of
   that number and bumps it, so this file is the whole migration history and
   running it against any older database brings it forward. Add steps at the
   bottom; never edit one that has shipped. */
IF OBJECT_ID('dbo.SchemaVersion') IS NULL
BEGIN
    CREATE TABLE dbo.SchemaVersion (
        Id          tinyint      NOT NULL CONSTRAINT PK_SchemaVersion PRIMARY KEY DEFAULT (1),
        Version     int          NOT NULL,
        AppliedAt   datetime2(0) NOT NULL CONSTRAINT DF_SchemaVersion_At DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_SchemaVersion_One CHECK (Id = 1)
    );
    INSERT dbo.SchemaVersion (Id, Version) VALUES (1, 0);
END
GO

DECLARE @v int = (SELECT Version FROM dbo.SchemaVersion WHERE Id = 1);
PRINT 'schema version ' + CAST(@v AS varchar(10));
GO

/* -- 1 -- the tables -------------------------------------------------------- */
IF (SELECT Version FROM dbo.SchemaVersion WHERE Id = 1) < 1
BEGIN
    PRINT 'migrating to 1: tables';
    /* All of it or none of it. The first cut of this file had a column
       called File - a reserved word - and fell over halfway through, leaving
       eight tables behind and the version still at 0, so the next run
       collided with its own leftovers. DDL is transactional here; use it.
       The guards above each CREATE are the belt to that brace: they let a
       database left in that state by the broken version come forward without
       being dropped first. */
    BEGIN TRY
    BEGIN TRAN;

    IF OBJECT_ID('dbo.Snapshot') IS NULL
    CREATE TABLE dbo.Snapshot (
        SnapshotId  int           IDENTITY(1,1) CONSTRAINT PK_Snapshot PRIMARY KEY,
        TakenAt     datetime2(0)  NOT NULL CONSTRAINT DF_Snapshot_At DEFAULT (SYSUTCDATETIME()),
        SavedAt     datetime2(0)  NULL,          /* what the file said about itself */
        Records     int           NOT NULL,
        Bytes       int           NOT NULL,
        Source      nvarchar(400) NULL,
        Doc         nvarchar(max) NOT NULL
    );

    IF OBJECT_ID('dbo.Record') IS NULL
    CREATE TABLE dbo.Record (
        Id           nvarchar(40)  NOT NULL CONSTRAINT PK_Record PRIMARY KEY,
        Code         nvarchar(20)  NULL,
        Title        nvarchar(400) NULL,
        Notes        nvarchar(max) NULL,
        Status       nvarchar(20)  NULL,
        Priority     nvarchar(4)   NULL,
        System       nvarchar(120) NULL,
        Type         nvarchar(60)  NULL,
        Ticket       nvarchar(60)  NULL,
        Requester    nvarchar(200) NULL,
        Folder       nvarchar(400) NULL,
        WaitOn       nvarchar(200) NULL,
        WaitNote     nvarchar(max) NULL,
        WaitSince    nvarchar(30)  NULL,
        WaitUntil    nvarchar(30)  NULL,
        AutoBlocked  bit           NULL,
        Created      datetime2(0)  NULL,
        Due          date          NULL,
        DueTime      nvarchar(10)  NULL,
        Started      datetime2(0)  NULL,
        Completed    datetime2(0)  NULL,
        EstimateMins int           NULL,
        SpentMins    float         NULL,
        Carried      int           NULL,
        FromRoutine  nvarchar(60)  NULL,
        ForDate      nvarchar(30)  NULL
    );
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Record_Status'
                   AND object_id = OBJECT_ID('dbo.Record'))
    CREATE INDEX IX_Record_Status  ON dbo.Record (Status) INCLUDE (Due, Priority);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Record_Due'
                   AND object_id = OBJECT_ID('dbo.Record'))
    CREATE INDEX IX_Record_Due     ON dbo.Record (Due)    INCLUDE (Status);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Record_System'
                   AND object_id = OBJECT_ID('dbo.Record'))
    CREATE INDEX IX_Record_System  ON dbo.Record (System);

    IF OBJECT_ID('dbo.RecordLog') IS NULL
    CREATE TABLE dbo.RecordLog (
        LogId     int           IDENTITY(1,1) CONSTRAINT PK_RecordLog PRIMARY KEY,
        RecordId  nvarchar(40)  NOT NULL,
        At        datetime2(0)  NULL,
        Kind      nvarchar(30)  NULL,
        Text      nvarchar(max) NULL
    );
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RecordLog_Record'
                   AND object_id = OBJECT_ID('dbo.RecordLog'))
    CREATE INDEX IX_RecordLog_Record  ON dbo.RecordLog (RecordId, At);

    IF OBJECT_ID('dbo.RecordFile') IS NULL
    CREATE TABLE dbo.RecordFile (
        FileId    int           IDENTITY(1,1) CONSTRAINT PK_RecordFile PRIMARY KEY,
        RecordId  nvarchar(40)  NOT NULL,
        Name      nvarchar(400) NULL,
        Bytes     bigint        NULL,
        Type      nvarchar(120) NULL,
        Added     datetime2(0)  NULL
    );
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RecordFile_Record'
                   AND object_id = OBJECT_ID('dbo.RecordFile'))
    CREATE INDEX IX_RecordFile_Record  ON dbo.RecordFile (RecordId);

    IF OBJECT_ID('dbo.RecordStep') IS NULL
    CREATE TABLE dbo.RecordStep (
        StepId    int           IDENTITY(1,1) CONSTRAINT PK_RecordStep PRIMARY KEY,
        RecordId  nvarchar(40)  NOT NULL,
        Ordinal   int           NOT NULL,
        Text      nvarchar(max) NULL,
        Done      bit           NULL
    );
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RecordStep_Record'
                   AND object_id = OBJECT_ID('dbo.RecordStep'))
    CREATE INDEX IX_RecordStep_Record  ON dbo.RecordStep (RecordId, Ordinal);

    IF OBJECT_ID('dbo.RecordTag') IS NULL
    CREATE TABLE dbo.RecordTag (
        RecordId  nvarchar(40)  NOT NULL,
        Tag       nvarchar(80)  NOT NULL,
        CONSTRAINT PK_RecordTag PRIMARY KEY (RecordId, Tag)
    );

    IF OBJECT_ID('dbo.RecordBlocker') IS NULL
    CREATE TABLE dbo.RecordBlocker (
        RecordId   nvarchar(40) NOT NULL,
        BlockedBy  nvarchar(40) NOT NULL,
        CONSTRAINT PK_RecordBlocker PRIMARY KEY (RecordId, BlockedBy)
    );

    IF OBJECT_ID('dbo.Routine') IS NULL
    CREATE TABLE dbo.Routine (
        Id        nvarchar(40)  NOT NULL CONSTRAINT PK_Routine PRIMARY KEY,
        Title     nvarchar(400) NULL,
        Freq      nvarchar(30)  NULL,
        AutoRun   bit           NULL,
        Doc       nvarchar(max) NULL          /* the rest of it, as it came */
    );

    IF OBJECT_ID('dbo.Script') IS NULL
    CREATE TABLE dbo.Script (
        Id        nvarchar(40)  NOT NULL CONSTRAINT PK_Script PRIMARY KEY,
        Name      nvarchar(200) NULL,
        FileName  nvarchar(400) NULL,   /* not "File": FILE is a reserved word */
        Descr     nvarchar(max) NULL
    );

    IF OBJECT_ID('dbo.Setting') IS NULL
    CREATE TABLE dbo.Setting (
        [Key]     nvarchar(120) NOT NULL CONSTRAINT PK_Setting PRIMARY KEY,
        Value     nvarchar(max) NULL
    );

    UPDATE dbo.SchemaVersion SET Version = 1, AppliedAt = SYSUTCDATETIME() WHERE Id = 1;
    COMMIT;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK;
        PRINT 'migration 1 rolled back; the database is as it was';
        THROW;
    END CATCH
END
GO

/* -- 2 -- the views a person actually queries ------------------------------- */
IF (SELECT Version FROM dbo.SchemaVersion WHERE Id = 1) < 2
BEGIN
    PRINT 'migrating to 2: views';
    EXEC (N'
        CREATE OR ALTER VIEW dbo.vOpenWork AS
        SELECT  r.Code, r.Title, r.Status, r.Priority, r.System, r.Due,
                DATEDIFF(day, r.Created, SYSUTCDATETIME())              AS AgeDays,
                CASE WHEN r.Due < CAST(SYSUTCDATETIME() AS date) THEN 1 ELSE 0 END AS Overdue,
                r.SpentMins, r.EstimateMins, r.Requester, r.WaitOn
        FROM    dbo.Record r
        WHERE   r.Status IN (''open'', ''processing'', ''blocked'');
    ');
    EXEC (N'
        CREATE OR ALTER VIEW dbo.vClosedByWeek AS
        SELECT  DATEFROMPARTS(YEAR(r.Completed), MONTH(r.Completed), 1) AS [Month],
                DATEPART(iso_week, r.Completed)                        AS IsoWeek,
                r.System, COUNT(*) AS Closed, SUM(r.SpentMins) AS Minutes
        FROM    dbo.Record r
        WHERE   r.Completed IS NOT NULL
        GROUP BY DATEFROMPARTS(YEAR(r.Completed), MONTH(r.Completed), 1),
                 DATEPART(iso_week, r.Completed), r.System;
    ');
    UPDATE dbo.SchemaVersion SET Version = 2, AppliedAt = SYSUTCDATETIME() WHERE Id = 1;
END
GO

/* -- the load ---------------------------------------------------------------
   Everything below runs only for mode=push. The file is read whole, kept
   whole, and then shredded; all of it in one transaction, so a half-loaded
   database is not a state this can end in. */
IF '$(mode)' <> 'push' GOTO done;

DECLARE @doc nvarchar(max), @bin varbinary(max);

SELECT @bin = BulkColumn
FROM   OPENROWSET(BULK '$(file)', SINGLE_BLOB) AS src;

IF LEFT(@bin, 3) = 0xEFBBBF                   /* a BOM, if the editor left one */
    SET @bin = SUBSTRING(@bin, 4, DATALENGTH(@bin));

/* dossier.json is UTF-8. SINGLE_CLOB would read it in the server's own code
   page and turn every Khmer character into rubbish, so the bytes are decoded
   through a UTF-8 collation instead. That collation needs SQL Server 2019 or
   newer; on anything older the dynamic batch below fails to compile, which is
   catchable only because it IS a dynamic batch - and the fallback is the old
   behaviour, correct for ASCII and wrong in the same way it always was. */
BEGIN TRY
    EXEC sp_executesql
         N'SELECT @out = CONVERT(nvarchar(max), CONVERT(varchar(max), @b) COLLATE Latin1_General_100_CI_AS_SC_UTF8)',
         N'@b varbinary(max), @out nvarchar(max) OUTPUT',
         @b = @bin, @out = @doc OUTPUT;
END TRY
BEGIN CATCH
    PRINT 'note: this engine has no UTF-8 collation; non-ASCII text may not survive';
    SET @doc = CONVERT(nvarchar(max), CONVERT(varchar(max), @bin));
END CATCH

IF @doc IS NULL OR ISJSON(@doc) <> 1
BEGIN
    RAISERROR('$(file) is not readable as JSON', 16, 1);
    GOTO done;
END

IF JSON_VALUE(@doc, '$.app') <> 'dossier'
BEGIN
    RAISERROR('$(file) is not a Dossier workspace (no app:"dossier")', 16, 1);
    GOTO done;
END

BEGIN TRAN;

INSERT dbo.Snapshot (SavedAt, Records, Bytes, Source, Doc)
SELECT TRY_CONVERT(datetime2(0), JSON_VALUE(@doc, '$.savedAt')),
       (SELECT COUNT(*) FROM OPENJSON(@doc, '$.tasks')),
       DATALENGTH(@doc) / 2, '$(file)', @doc;

/* a push is a photograph of the file, not a merge: what is in the tables is
   what the file says, and the history lives in Snapshot */
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
SELECT x.id, x.name, x.file, x.descr
FROM OPENJSON(@doc, '$.scripts') WITH (
        id nvarchar(40) '$.id', name nvarchar(200) '$.name',
        file nvarchar(400) '$.file', descr nvarchar(max) '$.desc') AS x
WHERE x.id IS NOT NULL;

/* settings are a bag of anything, so they are kept as key/value with the
   nested ones left as the JSON they are */
INSERT dbo.Setting ([Key], Value)
SELECT s.[key], s.value
FROM OPENJSON(@doc, '$.settings') AS s;

COMMIT;

PRINT 'pushed: ' + CAST((SELECT COUNT(*) FROM dbo.Record) AS varchar(10)) + ' record(s), '
      + CAST((SELECT COUNT(*) FROM dbo.RecordLog) AS varchar(10)) + ' log line(s), '
      + CAST((SELECT COUNT(*) FROM dbo.RecordFile) AS varchar(10)) + ' document(s)';

done:
SELECT  Snapshots      = (SELECT COUNT(*) FROM dbo.Snapshot),
        Records        = (SELECT COUNT(*) FROM dbo.Record),
        Open           = (SELECT COUNT(*) FROM dbo.Record WHERE Status IN ('open','processing','blocked')),
        Overdue        = (SELECT COUNT(*) FROM dbo.Record
                          WHERE Status IN ('open','processing','blocked')
                            AND Due < CAST(SYSUTCDATETIME() AS date)),
        Documents      = (SELECT COUNT(*) FROM dbo.RecordFile),
        SchemaVersion  = (SELECT Version FROM dbo.SchemaVersion WHERE Id = 1),
        LastPush       = (SELECT MAX(TakenAt) FROM dbo.Snapshot);
GO
