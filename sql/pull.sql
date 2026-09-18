/* ===========================================================================
   The newest snapshot, back out as a file.

   Driven by scripts\dossier-sql.bat pull. By hand:

       sqlcmd -S "(localdb)\MSSQLLocalDB" -d Dossier -b -h -1 -y 0 -W ^
              -i sql\pull.sql -o dossier-from-sql.json

   What comes out is the exact bytes that went in - the file Dossier wrote,
   kept whole in Snapshot.Doc - not a reconstruction from the shredded
   tables. A restore that rebuilds from columns is a restore that quietly
   drops the field nobody remembered to shred; this one cannot.

   The switches matter: -h -1 removes the header, -y 0 stops sqlcmd
   truncating a long value, and -W trims the padding it would otherwise add.
   scripts\dossier-sql.bat passes all three.

   -v id="<n>" picks an older snapshot; leave it out for the newest.
   =========================================================================== */

SET NOCOUNT ON;

DECLARE @id int = TRY_CONVERT(int, NULLIF('$(id)', ''));

SELECT TOP (1) Doc
FROM   dbo.Snapshot
WHERE  (@id IS NULL OR SnapshotId = @id)
ORDER BY SnapshotId DESC;
