"""Find T-SQL reserved words used as bare identifiers, anywhere - not just in
CREATE TABLE. Last time this only looked at column declarations and missed
x.file, an OPENJSON WITH column called file, and an alias called Open."""
import re, sys

RESERVED = set("""ADD EXTERNAL PROCEDURE ALL FETCH PUBLIC ALTER FILE RAISERROR AND FILLFACTOR READ ANY FOR READTEXT
AS FOREIGN RECONFIGURE ASC FREETEXT REFERENCES AUTHORIZATION FREETEXTTABLE REPLICATION BACKUP FROM RESTORE BEGIN FULL
RESTRICT BETWEEN FUNCTION RETURN BREAK GOTO REVERT BROWSE GRANT REVOKE BULK GROUP RIGHT BY HAVING ROLLBACK CASCADE
HOLDLOCK ROWCOUNT CASE IDENTITY ROWGUIDCOL CHECK IDENTITY_INSERT RULE CHECKPOINT IDENTITYCOL SAVE CLOSE IF SCHEMA
CLUSTERED IN SECURITYAUDIT COALESCE INDEX SELECT COLLATE INNER SEMANTICKEYPHRASETABLE COLUMN INSERT
SEMANTICSIMILARITYDETAILSTABLE COMMIT INTERSECT SEMANTICSIMILARITYTABLE COMPUTE INTO SESSION_USER CONSTRAINT IS SET
CONTAINS JOIN SETUSER CONTAINSTABLE KEY SHUTDOWN CONTINUE KILL SOME CONVERT LEFT STATISTICS CREATE LIKE SYSTEM_USER
CROSS LINENO TABLE CURRENT LOAD TABLESAMPLE CURRENT_DATE MERGE TEXTSIZE CURRENT_TIME NATIONAL THEN CURRENT_TIMESTAMP
NOCHECK TO CURRENT_USER NONCLUSTERED TOP CURSOR NOT TRAN DATABASE NULL TRANSACTION DBCC NULLIF TRIGGER DEALLOCATE OF
TRUNCATE DECLARE OFF TRY_CONVERT DEFAULT OFFSETS TSEQUAL DELETE ON UNION DENY OPEN UNIQUE DESC OPENDATASOURCE
UNPIVOT DISK OPENQUERY UPDATE DISTINCT OPENROWSET UPDATETEXT DISTRIBUTED OPENXML USE DOUBLE OPTION USER DROP OR
VALUES DUMP ORDER VARYING ELSE OUTER VIEW END OVER WAITFOR ERRLVL PERCENT WHEN ESCAPE PIVOT WHERE EXCEPT PLAN WHILE
EXEC PRECISION WITH EXECUTE PRIMARY WITHIN EXISTS PRINT WRITETEXT EXIT PROC""".split())

TYPES = r"(?:n?varchar|n?char|int|bigint|tinyint|smallint|bit|float|real|date|datetime2?|decimal|numeric|money|uniqueidentifier|varbinary|xml)"

def blank_noise(s):
    s = re.sub(r"/\*.*?\*/", lambda m: " " * len(m.group(0)), s, flags=re.S)
    s = re.sub(r"--[^\n]*", lambda m: " " * len(m.group(0)), s)
    s = re.sub(r"'(?:[^']|'')*'", lambda m: " " * len(m.group(0)), s)   # string literals
    s = re.sub(r"\[[^\]]*\]", lambda m: " " * len(m.group(0)), s)       # already bracketed
    return s

def check(path):
    raw = open(path).read()
    code = blank_noise(raw)
    hits = []
    def at(pos): return raw[:pos].count("\n") + 1
    # a.column
    for m in re.finditer(r"\.\s*([A-Za-z_]\w*)", code):
        if m.group(1).upper() in RESERVED: hits.append((at(m.start(1)), "qualified column", m.group(1)))
    # column declarations and OPENJSON WITH columns:  name <type>
    for m in re.finditer(r"(?m)(?:^|[(,]\s*)\s*([A-Za-z_]\w*)\s+" + TYPES + r"\b", code):
        if m.group(1).upper() in RESERVED: hits.append((at(m.start(1)), "column declaration", m.group(1)))
    # SELECT alias = expr
    for m in re.finditer(r"(?m)^\s*([A-Za-z_]\w*)\s*=\s*\(?\s*SELECT", code):
        if m.group(1).upper() in RESERVED: hits.append((at(m.start(1)), "select alias", m.group(1)))
    # AS alias
    for m in re.finditer(r"\bAS\s+([A-Za-z_]\w*)\s*(?:[,)]|$)", code, re.I):
        if m.group(1).upper() in RESERVED: hits.append((at(m.start(1)), "AS alias", m.group(1)))
    # INSERT column lists
    for m in re.finditer(r"INSERT\s+[\w.]+\s*\(([^)]*)\)", code, re.I):
        for col in m.group(1).split(","):
            c = col.strip()
            if c and c.upper() in RESERVED:
                hits.append((at(m.start(1)), "insert column", c))
    return sorted(set(hits))

# and the other thing SQL Server would not forgive: a subquery inside PRINT
def print_subqueries(path):
    code = blank_noise(open(path).read())
    out = []
    for m in re.finditer(r"(?is)\bPRINT\b(.{0,400}?);", code):
        if re.search(r"\(\s*SELECT", m.group(1), re.I):
            out.append(code[:m.start()].count("\n") + 1)
    return out

for p in sys.argv[1:]:
    print("==", p)
    for line, why, word in check(p):
        print("   line %-4d %-18s %s" % (line, why, word))
    for line in print_subqueries(p):
        print("   line %-4d %-18s subquery inside PRINT" % (line, ""))
