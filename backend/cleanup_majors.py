#!/usr/bin/env python3
"""One-shot cleanup: remove major publisher games from the database.

Run this after pulling the latest code on a fresh server to discard
any AAA games that were added before the publisher detection fix.

Usage: python3 cleanup_majors.py
"""
from database import SessionLocal
from models import Game, DiscardedGame
from config import MAJOR_PUBLISHER_TOKENS
from sqlalchemy import text

def main():
    db = SessionLocal()

    games = db.query(Game).all()
    discarded = 0

    for game in games:
        is_major = False
        for field in (game.publisher, game.developer):
            if not field:
                continue
            lower = field.lower()
            for token in MAJOR_PUBLISHER_TOKENS:
                if token in lower:
                    is_major = True
                    break
            if is_major:
                break

        if not is_major:
            continue

        print(f"Discarding: {game.title} ({game.appid}) — {game.developer} / {game.publisher}")

        # Delete related rows
        for tbl, col in [
            ("game_snapshots", "appid"),
            ("ops_scores", "appid"),
            ("youtube_videos", "matched_appid"),
            ("twitch_snapshots", "appid"),
            ("reddit_mentions", "appid"),
        ]:
            count = db.execute(
                text(f"DELETE FROM {tbl} WHERE {col} = :a"), {"a": game.appid}
            ).rowcount
            if count:
                print(f"  deleted {count} rows from {tbl}")

        db.delete(game)

        existing = db.query(DiscardedGame).filter_by(appid=game.appid).first()
        if not existing:
            db.add(DiscardedGame(appid=game.appid, title=game.title, reason="major_publisher"))

        discarded += 1

    db.commit()
    db.close()

    if discarded:
        print(f"\nDone. Discarded {discarded} major publisher games.")
    else:
        print("No major publisher games found. Database is clean.")

if __name__ == "__main__":
    main()
