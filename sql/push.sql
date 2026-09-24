/* ===========================================================================
   Dossier in SQL Server LocalDB - loading a dossier.json
   ---------------------------------------------------------------------------
   Reads the file whole, keeps it whole in dbo.Snapshot, and shreds it into
   the tables. One transaction: a half-loaded database is not a state this
   can end in.

   sql\schema.sql must have run first - scripts\dossier-sql.bat push does
   both, in that order.

       sqlcmd -S "(localdb)\MSSQLLocalDB" -d Dossier -b -i sql\push.sql ^
              -v file="C:\path\to\dossier.json" replace="0"

   IT WILL NOT REPLACE A DATABASE THAT HAS RECORDS IN IT unless replace="1".
   A push used to be a photograph of the file, full stop: whatever the
   database held was swapped for whatever the file held. With the bridge
   the database is the store and the file is an export, usually older - so
   "push" was the command that put last week over this week. Now it refuses
   and says why, and even with replace="1" the database's own state is kept
   in dbo.WorkspaceHistory before it is replaced.
   =========================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

:on error exit

DECLARE @doc nvarchar(max), @bin varbinary(max);

SELECT @bin = BulkColumn
FROM   OPENROWSET(BULK '$(file)', SINGLE_BLOB) AS src;

IF SUBSTRING(@bin, 1, 3) = 0xEFBBBF                   /* a BOM, if the editor left one */
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
    RAISERROR('The file passed in -v file could not be read as JSON.', 16, 1);
    RETURN;
END

IF JSON_VALUE(@doc, '$.app') <> 'dossier'
BEGIN
    RAISERROR('That file is not a Dossier workspace - no app:"dossier" in it.', 16, 1);
    RETURN;
END

/* What the file holds, counted before anything is written. If this says 0
   records, the loader is working and the file is empty - which is worth
   knowing at a glance, because the two look identical from SSMS. */
DECLARE @inFile int, @inBooks int, @inInc int;
SELECT @inFile  = COUNT(*) FROM OPENJSON(@doc, '$.tasks');
SELECT @inBooks = COUNT(*) FROM OPENJSON(@doc, '$.settings.runbooks');
SELECT @inInc   = COUNT(*) FROM OPENJSON(@doc, '$.incidents');
PRINT 'the file holds ' + CAST(@inFile AS varchar(10)) + ' record(s), '
      + CAST(@inBooks AS varchar(10)) + ' runbook(s), '
      + CAST(@inInc AS varchar(10)) + ' incident(s)';
IF @inFile = 0
    PRINT 'WARNING: no records in that file. Is it the workspace you meant?';

/* the database's side of the same question */
DECLARE @have int = (SELECT Records FROM dbo.Workspace WHERE Id = 1);
IF ISNULL(@have, 0) > 0 AND '$(replace)' <> '1'
BEGIN
    PRINT '';
    PRINT 'The database already holds ' + CAST(@have AS varchar(10)) + ' record(s).';
    PRINT 'Pushing would replace them with the file''s ' + CAST(@inFile AS varchar(10)) + '. Nothing was written.';
    PRINT '';
    PRINT 'To ADD the file''s records to what is there, use Dossier itself:';
    PRINT '    Menu -> Workspace -> Import a JSON export -> Merge';
    PRINT 'To replace anyway (the current contents are kept in history first):';
    PRINT '    dossier-sql.bat push --replace "<file>"';
    RAISERROR('push refused: the database is not empty', 16, 1);
    RETURN;
END

BEGIN TRAN;

/* whatever is there now, kept before it is replaced */
IF @have IS NOT NULL AND OBJECT_ID('dbo.WorkspaceHistory') IS NOT NULL
    INSERT dbo.WorkspaceHistory (Records, Bytes, Reason, Doc)
    SELECT Records, DATALENGTH(Doc), N'before push', COMPRESS(Doc)
    FROM dbo.Workspace WHERE Id = 1;

INSERT dbo.Snapshot (SavedAt, Records, Bytes, Source, Doc)
SELECT TRY_CONVERT(datetime2(0), JSON_VALUE(@doc, '$.savedAt')),
       (SELECT COUNT(*) FROM OPENJSON(@doc, '$.tasks')),
       DATALENGTH(@doc) / 2, '$(file)', @doc;

/* a push is a photograph of the file, not a merge: what is in the tables is
   what the file says, and the history lives in Snapshot */
EXEC dbo.LoadWorkspace @doc;

COMMIT;

/* PRINT takes an expression and a subquery is not one - Msg 1046. The
   counts are fetched first and printed second. */
DECLARE @nRec int, @nLog int, @nDoc int;
SELECT @nRec = COUNT(*) FROM dbo.Record;
SELECT @nLog = COUNT(*) FROM dbo.RecordLog;
SELECT @nDoc = COUNT(*) FROM dbo.RecordFile;
PRINT 'pushed: ' + CAST(@nRec AS varchar(10)) + ' record(s), '
      + CAST(@nLog AS varchar(10)) + ' log line(s), '
      + CAST(@nDoc AS varchar(10)) + ' document(s)';

/* what is in there now */
SELECT  Snapshots      = (SELECT COUNT(*) FROM dbo.Snapshot),
        Records        = (SELECT COUNT(*) FROM dbo.Record),
        [Open]         = (SELECT COUNT(*) FROM dbo.Record WHERE Status IN ('open','processing','blocked')),
        Overdue        = (SELECT COUNT(*) FROM dbo.Record
                          WHERE Status IN ('open','processing','blocked')
                            AND Due < CAST(SYSUTCDATETIME() AS date)),
        Documents      = (SELECT COUNT(*) FROM dbo.RecordFile),
        Runbooks       = (SELECT COUNT(*) FROM dbo.Runbook),
        Profiles       = (SELECT COUNT(*) FROM dbo.SystemProfile),
        Notes          = (SELECT COUNT(*) FROM dbo.Note),
        Incidents      = (SELECT COUNT(*) FROM dbo.Incident),
        Conversations  = (SELECT COUNT(*) FROM dbo.Chat),
        SchemaVersion  = (SELECT Version FROM dbo.SchemaVersion WHERE Id = 1),
        LastPush       = (SELECT MAX(TakenAt) FROM dbo.Snapshot);
GO
