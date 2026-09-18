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

/* what the database looks like now */
SELECT  SchemaVersion = (SELECT Version FROM dbo.SchemaVersion WHERE Id = 1),
        Tables        = (SELECT COUNT(*) FROM sys.tables WHERE schema_id = SCHEMA_ID('dbo')),
        Views         = (SELECT COUNT(*) FROM sys.views  WHERE schema_id = SCHEMA_ID('dbo')),
        Snapshots     = (SELECT COUNT(*) FROM dbo.Snapshot);
GO
