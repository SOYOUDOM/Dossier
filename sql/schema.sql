/* ===========================================================================
   Dossier in SQL Server LocalDB - the database and its tables
   ---------------------------------------------------------------------------
   Creates the database and brings the tables up to date. Nothing else.
   Idempotent: running it twice does nothing the second time.

   Driven by scripts\dossier-sql.bat init; by hand:

       sqlcmd -S "(localdb)\MSSQLLocalDB" -b -i sql\schema.sql -v db="Dossier"

   THE LOAD IS A SEPARATE FILE, sql\push.sql, and that is not an accident.
   T-SQL parses a whole batch before running a line of it, so a syntax error
   in the load - in code that "init" was never going to execute - stopped the
   schema from being created at all. Twice. Two files, two parses, and a
   mistake in one cannot take the other down with it.

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

/* -- 3 -- the rest of the workspace ------------------------------------------
   Migration 1 covered records. Everything else a workspace holds was going
   into dbo.Setting as a lump of JSON under one key - the runbook library,
   the system profiles, the notes the assistant has been taught - and the
   incident history and the conversations were not shredded at all. A
   database you cannot query is a file with extra steps, so they each get a
   table. */
IF (SELECT Version FROM dbo.SchemaVersion WHERE Id = 1) < 3
BEGIN
    PRINT 'migrating to 3: runbooks, profiles, notes, incidents, conversations';
    BEGIN TRY
    BEGIN TRAN;

    /* A runbook has no id of its own in the workspace; its title is what the
       app matches on and what an import replaces by. So the title is the
       natural key and the surrogate below is only here for the child rows. */
    IF OBJECT_ID('dbo.Runbook') IS NULL
    CREATE TABLE dbo.Runbook (
        RunbookId   int           IDENTITY(1,1) CONSTRAINT PK_Runbook PRIMARY KEY,
        Title       nvarchar(400) NOT NULL,
        System      nvarchar(120) NULL,
        Severity    nvarchar(4)   NULL,
        Status      nvarchar(30)  NULL,       /* draft, verified, ... */
        Owner       nvarchar(200) NULL,
        Verified    nvarchar(40)  NULL,       /* when somebody last stood behind it */
        Uses        int           NULL,
        Escalation  nvarchar(max) NULL,
        Checks      nvarchar(max) NULL,       /* the queries, as written */
        CONSTRAINT UQ_Runbook_Title UNIQUE (Title)
    );
    IF OBJECT_ID('dbo.RunbookTrigger') IS NULL
    CREATE TABLE dbo.RunbookTrigger (
        RunbookId  int           NOT NULL,
        Ordinal    int           NOT NULL,
        Phrase     nvarchar(400) NULL,
        CONSTRAINT PK_RunbookTrigger PRIMARY KEY (RunbookId, Ordinal)
    );
    IF OBJECT_ID('dbo.RunbookStep') IS NULL
    CREATE TABLE dbo.RunbookStep (
        RunbookId  int           NOT NULL,
        Ordinal    int           NOT NULL,
        Text       nvarchar(max) NULL,
        CONSTRAINT PK_RunbookStep PRIMARY KEY (RunbookId, Ordinal)
    );

    IF OBJECT_ID('dbo.SystemProfile') IS NULL
    CREATE TABLE dbo.SystemProfile (
        System   nvarchar(120) NOT NULL CONSTRAINT PK_SystemProfile PRIMARY KEY,
        Facts    nvarchar(max) NULL,
        Quirks   nvarchar(max) NULL,          /* what the system lies about */
        Tables   nvarchar(max) NULL,
        Owner    nvarchar(200) NULL,
        Updated  datetime2(0)  NULL
    );

    /* what the assistant has been taught, in plain sight and deletable */
    IF OBJECT_ID('dbo.Note') IS NULL
    CREATE TABLE dbo.Note (
        Id       nvarchar(60)  NOT NULL CONSTRAINT PK_Note PRIMARY KEY,
        Title    nvarchar(400) NULL,
        Body     nvarchar(max) NULL,
        System   nvarchar(120) NULL,
        Tags     nvarchar(400) NULL,
        Created  datetime2(0)  NULL,
        Updated  datetime2(0)  NULL
    );

    /* the imported incident history - the one table here likely to run to
       thousands of rows, and the one most worth a SQL question */
    IF OBJECT_ID('dbo.Incident') IS NULL
    CREATE TABLE dbo.Incident (
        Num        nvarchar(40)  NOT NULL CONSTRAINT PK_Incident PRIMARY KEY,
        Opened     datetime2(0)  NULL,
        Resolved   datetime2(0)  NULL,
        Closed     datetime2(0)  NULL,
        Title      nvarchar(400) NULL,
        Descr      nvarchar(max) NULL,
        Sys        nvarchar(160) NULL,
        Ci         nvarchar(160) NULL,
        Cat        nvarchar(120) NULL,
        Sub        nvarchar(120) NULL,
        [Group]    nvarchar(160) NULL,
        Who        nvarchar(160) NULL,
        Caller     nvarchar(160) NULL,
        Pri        nvarchar(10)  NULL,
        State      nvarchar(60)  NULL,
        CloseCode  nvarchar(120) NULL,
        CloseNotes nvarchar(max) NULL,
        Cause      nvarchar(max) NULL,
        Reopens    int           NULL
    );
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Incident_Sys'
                   AND object_id = OBJECT_ID('dbo.Incident'))
    CREATE INDEX IX_Incident_Sys ON dbo.Incident (Sys, Opened);

    /* the assistant's conversations, which live with the records on purpose */
    IF OBJECT_ID('dbo.Chat') IS NULL
    CREATE TABLE dbo.Chat (
        Id       nvarchar(60)  NOT NULL CONSTRAINT PK_Chat PRIMARY KEY,
        Title    nvarchar(400) NULL,
        Created  datetime2(0)  NULL,
        Updated  datetime2(0)  NULL,
        Messages int           NULL
    );
    IF OBJECT_ID('dbo.ChatMessage') IS NULL
    CREATE TABLE dbo.ChatMessage (
        ChatId   nvarchar(60)  NOT NULL,
        Ordinal  int           NOT NULL,
        Who      nvarchar(20)  NULL,          /* you, bot, receipt */
        Text     nvarchar(max) NULL,
        CONSTRAINT PK_ChatMessage PRIMARY KEY (ChatId, Ordinal)
    );

    /* the working calendar, because "overdue" means nothing without it */
    IF OBJECT_ID('dbo.Holiday') IS NULL
    CREATE TABLE dbo.Holiday (
        [Date]  date          NOT NULL CONSTRAINT PK_Holiday PRIMARY KEY,
        Name    nvarchar(200) NULL,
        Kind    nvarchar(40)  NULL
    );

    UPDATE dbo.SchemaVersion SET Version = 3, AppliedAt = SYSUTCDATETIME() WHERE Id = 1;
    COMMIT;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK;
        PRINT 'migration 3 rolled back; the database is as it was';
        THROW;
    END CATCH
END
GO

/* -- 4 -- what the library looks like ---------------------------------------- */
IF (SELECT Version FROM dbo.SchemaVersion WHERE Id = 1) < 4
BEGIN
    PRINT 'migrating to 4: library views';
    EXEC (N'
        CREATE OR ALTER VIEW dbo.vRunbooks AS
        SELECT  b.Title, b.System, b.Severity, b.Status, b.Owner, b.Uses,
                Triggers  = (SELECT COUNT(*) FROM dbo.RunbookTrigger t WHERE t.RunbookId = b.RunbookId),
                Steps     = (SELECT COUNT(*) FROM dbo.RunbookStep    s WHERE s.RunbookId = b.RunbookId),
                HasChecks = CASE WHEN DATALENGTH(b.Checks) > 0 THEN 1 ELSE 0 END
        FROM    dbo.Runbook b;
    ');
    EXEC (N'
        CREATE OR ALTER VIEW dbo.vIncidentsBySystem AS
        SELECT  Sys, Pri, Incidents = COUNT(*),
                Reopened  = SUM(CASE WHEN Reopens > 0 THEN 1 ELSE 0 END),
                FirstSeen = MIN(Opened), LastSeen = MAX(Opened)
        FROM    dbo.Incident
        GROUP BY Sys, Pri;
    ');
    UPDATE dbo.SchemaVersion SET Version = 4, AppliedAt = SYSUTCDATETIME() WHERE Id = 1;
END
GO

/* -- 5 -- the database as the store, not the copy -----------------------------
   Up to here the file was the record and this was a queryable copy of it.
   With the bridge running it is the other way round: every change Dossier
   makes is written here, in a transaction, and the JSON beside your records
   is an export.

   Two tables make that possible. Workspace holds the current state whole -
   what a read returns, so nothing has to be reassembled from the columns and
   no field can be lost by a shred that forgot it. Attachment holds the bytes
   of every document, because "everything is in the database" should mean the
   screenshots too. */
IF (SELECT Version FROM dbo.SchemaVersion WHERE Id = 1) < 5
BEGIN
    PRINT 'migrating to 5: the workspace itself, and attachment bytes';
    BEGIN TRY
    BEGIN TRAN;

    IF OBJECT_ID('dbo.Workspace') IS NULL
    CREATE TABLE dbo.Workspace (
        Id         tinyint       NOT NULL CONSTRAINT PK_Workspace PRIMARY KEY DEFAULT (1),
        Doc        nvarchar(max) NOT NULL,
        Records    int           NULL,
        UpdatedAt  datetime2(0)  NOT NULL CONSTRAINT DF_Workspace_At DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_Workspace_One CHECK (Id = 1)
    );

    IF OBJECT_ID('dbo.Attachment') IS NULL
    CREATE TABLE dbo.Attachment (
        AttachmentId nvarchar(40)   NOT NULL CONSTRAINT PK_Attachment PRIMARY KEY,
        RecordId     nvarchar(40)   NULL,
        Name         nvarchar(400)  NULL,
        Type         nvarchar(160)  NULL,
        Bytes        int            NULL,
        Added        datetime2(0)   NULL CONSTRAINT DF_Attachment_At DEFAULT (SYSUTCDATETIME()),
        Content      varbinary(max) NULL
    );
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Attachment_Record'
                   AND object_id = OBJECT_ID('dbo.Attachment'))
    CREATE INDEX IX_Attachment_Record ON dbo.Attachment (RecordId);

    UPDATE dbo.SchemaVersion SET Version = 5, AppliedAt = SYSUTCDATETIME() WHERE Id = 1;
    COMMIT;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK;
        PRINT 'migration 5 rolled back; the database is as it was';
        THROW;
    END CATCH
END
GO

/* what the database looks like now */
SELECT  SchemaVersion = (SELECT Version FROM dbo.SchemaVersion WHERE Id = 1),
        Tables        = (SELECT COUNT(*) FROM sys.tables WHERE schema_id = SCHEMA_ID('dbo')),
        Views         = (SELECT COUNT(*) FROM sys.views  WHERE schema_id = SCHEMA_ID('dbo')),
        Snapshots     = (SELECT COUNT(*) FROM dbo.Snapshot),
        Records       = (SELECT COUNT(*) FROM dbo.Record);

/* Empty tables look like a broken install and are not one: this file makes
   the shape, and nothing else. Say so rather than leaving somebody to open
   SSMS and wonder where their work went. */
IF NOT EXISTS (SELECT 1 FROM dbo.Snapshot)
BEGIN
    PRINT '';
    PRINT '  The tables are here and they are empty. Creating them loads nothing.';
    PRINT '  To put your workspace in:';
    PRINT '     dossier-sql.bat push "<the folder you keep records in>\dossier.json"';
    PRINT '  Not sure which file that is?   dossier-sql.bat find';
END
GO
