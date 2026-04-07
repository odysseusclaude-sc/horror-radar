"""One-time script: queue AppIDs discovered since Apr 3 that never made it into games/discarded_games."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import SessionLocal
from models import PendingMetadata, Game, DiscardedGame
from sqlalchemy import text
from datetime import datetime

def run():
    db = SessionLocal()
    try:
        # Get known appids
        known = {r[0] for r in db.execute(text("SELECT appid FROM games")).fetchall()}
        known |= {r[0] for r in db.execute(text("SELECT appid FROM discarded_games")).fetchall()}
        already_queued = {r[0] for r in db.execute(text("SELECT appid FROM pending_metadata")).fetchall()}

        print(f"Known games: {len(known)}, already queued: {len(already_queued)}")

        # You can add specific AppIDs here that were missed during the outage
        # Or fetch them fresh from discovery by running discovery manually
        missed_appids = []  # populate if you have a list

        added = 0
        for appid in missed_appids:
            if appid not in known and appid not in already_queued:
                db.add(PendingMetadata(appid=appid, source="recovery", priority=1))
                added += 1

        db.commit()
        print(f"Queued {added} AppIDs for recovery processing")
    finally:
        db.close()

if __name__ == "__main__":
    run()
