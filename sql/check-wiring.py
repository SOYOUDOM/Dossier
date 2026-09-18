"""Every .sql file in sql/ must actually be run by scripts\\dossier-sql.bat.

Written after shipping sql/load-proc.sql and forgetting to add the line that
runs it - so the bridge spent an afternoon answering every save with "Could
not find stored procedure 'dbo.LoadWorkspace'". A file in the repository that
nothing executes looks exactly like a file that works."""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

bat = open(os.path.join(ROOT, "scripts", "dossier-sql.bat"), encoding="ascii").read()
files = sorted(f for f in os.listdir(HERE) if f.endswith(".sql"))
run = set(re.findall(r'-i "%SQLDIR%\\(\w[\w-]*\.sql)"', bat))

print("sql files      :", ", ".join(files))
print("run by the bat :", ", ".join(sorted(run)) or "NONE")
orphans = [f for f in files if f not in run]
if orphans:
    print("!! never run   :", ", ".join(orphans))
    sys.exit(1)

# and the reverse: a line that runs a file which is not there
ghosts = [f for f in sorted(run) if not os.path.exists(os.path.join(HERE, f))]
if ghosts:
    print("!! missing     :", ", ".join(ghosts))
    sys.exit(1)
print("every sql file is wired up")
