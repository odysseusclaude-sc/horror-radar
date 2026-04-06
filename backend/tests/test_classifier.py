"""Tests for horror and indie classifier functions.

Run from backend/: python -m pytest tests/test_classifier.py -v
Or directly:       python tests/test_classifier.py

Edge cases sourced from CLAUDE.md Lessons Learned (2026-04-04) and
prior DB audit findings (Arksync, Beta Massage Parlor, Darkwater,
Whispers of the Eyeless, unvoted-tag games, genre-dominant non-horror).
"""
import sys
import os

# Ensure backend/ is on the path when running as python tests/test_classifier.py
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from collectors.metadata import _is_horror, _is_indie


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def check(label: str, result: bool, expected: bool) -> bool:
    status = "PASS" if result == expected else "FAIL"
    if result != expected:
        print(f"  [{status}] {label}: got {result}, expected {expected}")
    else:
        print(f"  [{status}] {label}")
    return result == expected


# ---------------------------------------------------------------------------
# _is_horror tests
# ---------------------------------------------------------------------------

class TestIsHorror:
    # --- Layer 1: Strong horror tags ---

    def test_clear_horror_game(self):
        """Simple Horror tag with decent votes → True."""
        assert _is_horror({"Horror": 200, "Indie": 98}) is True

    def test_horror_plus_atmospheric(self):
        """Horror + Psychological Horror with votes → True."""
        assert _is_horror({"Horror": 150, "Psychological Horror": 120, "Atmospheric": 80}) is True

    def test_survival_horror_strong_tag(self):
        """Survival Horror is a strong tag → True."""
        assert _is_horror({"Survival Horror": 180, "Stealth": 60}) is True

    def test_horror_dominated_by_anti_horror_tags(self):
        """Horror tag + 4 anti-horror tags (Cartoon, Cute, Comedy, Family Friendly, Colorful)
        → anti_matches(5) >= strong_matches(1) + 3 → False."""
        tags = {
            "Horror": 100,
            "Cartoon": 80,
            "Cute": 70,
            "Comedy": 60,
            "Family Friendly": 50,
            "Colorful": 40,
        }
        assert _is_horror(tags) is False

    def test_horror_with_two_anti_tags_still_passes(self):
        """Horror + 2 anti-horror tags: 2 < 1+3 → still horror (comedy horror is valid)."""
        tags = {"Horror": 200, "Comedy": 50, "Funny": 30}
        assert _is_horror(tags) is True

    def test_horror_in_bottom_third_by_votes(self):
        """Horror tag has fewest votes (bottom third of 6+ tags) without desc/genre → False."""
        tags = {
            "Action": 500,
            "Shooter": 400,
            "FPS": 300,
            "Multiplayer": 250,
            "Co-op": 200,
            "Horror": 10,   # bottom third of 6 voted tags
        }
        assert _is_horror(tags) is False

    def test_horror_bottom_third_rescued_by_description(self):
        """Horror in bottom third, but description confirms → True."""
        tags = {
            "Action": 500,
            "Shooter": 400,
            "FPS": 300,
            "Multiplayer": 250,
            "Co-op": 200,
            "Horror": 10,
        }
        assert _is_horror(tags, description="a terrifying horror shooter set in haunted corridors") is True

    def test_beta_massage_parlor_pattern(self):
        """Game with City Builder (NON_HORROR_GENRE_TAG) + voted Horror tag
        and no description confirmation → False.
        Mirrors the Beta Massage Parlor Simulator case from CLAUDE.md."""
        tags = {
            "City Builder": 300,
            "Simulation": 250,
            "Horror": 50,
            "Indie": 40,
        }
        assert _is_horror(tags) is False

    def test_non_horror_genre_tag_rescued_by_description(self):
        """Puzzle + Horror + horror description → True (horror puzzle IS a thing)."""
        tags = {"Puzzle": 200, "Horror": 100, "Atmospheric": 60}
        desc = "A terrifying puzzle game set in a haunted asylum"
        assert _is_horror(tags, description=desc) is True

    def test_non_horror_genre_tag_rescued_by_steam_genre(self):
        """Puzzle + Horror tag + Steam genre 'Horror' → True."""
        tags = {"Puzzle": 200, "Horror": 100}
        assert _is_horror(tags, genres=["Horror", "Indie"]) is True

    def test_voted_non_horror_outweighs_horror_votes(self):
        """City Builder votes > Horror votes, no confirmation → False."""
        tags = {"City Builder": 500, "Horror": 80, "Indie": 200}
        assert _is_horror(tags) is False

    # --- Layer 2: Ambiguous horror tags ---

    def test_zombies_only_no_description(self):
        """Zombies is ambiguous — requires description or genre. Alone → False."""
        assert _is_horror({"Zombies": 150, "Indie": 50}) is False

    def test_zombies_with_horror_description(self):
        """Zombies + horror description → True (Layer 2 validation)."""
        assert _is_horror({"Zombies": 150}, description="survive a zombie apocalypse in this terrifying horror game") is True

    def test_lovecraftian_no_description(self):
        """Lovecraftian is ambiguous (many tactical/RPG games use it). Alone → False."""
        assert _is_horror({"Lovecraftian": 200, "RPG": 150, "Strategy": 100}) is False

    def test_lovecraftian_with_description_confirms(self):
        """Lovecraftian + description mentioning 'cosmic horror' → True."""
        assert _is_horror({"Lovecraftian": 200}, description="face eldritch cosmic horror in the void") is True

    def test_gothic_with_anti_horror_tag(self):
        """Gothic (ambiguous) + anti-horror tag → False (Layer 2: anti rejects)."""
        assert _is_horror({"Gothic": 120, "Cute": 100}) is False

    def test_dark_with_horror_genre(self):
        """Dark (ambiguous) + Steam genre Horror → True (Layer 2: genre confirms)."""
        assert _is_horror({"Dark": 100, "Indie": 80}, genres=["Horror"]) is True

    # --- Layer 0: Unvoted tags ---

    def test_whispers_of_the_eyeless_pattern(self):
        """New game with only unvoted Horror and Psychological Horror tags → True.
        All tags have 0 votes (SteamSpy not indexed yet), but strong horror tags
        still count — no conflicting signals present."""
        tags = {"Psychological Horror": 0, "Horror": 0, "Indie": 0}
        assert _is_horror(tags) is True

    def test_unvoted_horror_plus_romance_dating_sim_both(self):
        """Unvoted Horror + Romance + Dating Sim (2 NON_HORROR_GENRE_TAGS >= 1 strong + 1).
        The check: not has_vote_counts and not desc and len(non_horror) >= len(strong)+1
        → 2 >= 2 → True → reject → False."""
        tags = {"Horror": 0, "Romance": 0, "Dating Sim": 0}
        assert _is_horror(tags) is False

    def test_unvoted_horror_with_single_non_horror_genre(self):
        """Unvoted Horror + only one NON_HORROR_GENRE_TAG.
        1 >= 1+1=2 → False → NOT rejected by that check → True."""
        tags = {"Horror": 0, "Visual Novel": 0}
        assert _is_horror(tags) is True

    def test_arksync_pattern_unvoted_zombies_no_confirmation(self):
        """Arksync pattern: only Zombies (ambiguous) with 0 votes, no description.
        Ambiguous tags require confirmation — Layer 2 returns False."""
        tags = {"Zombies": 0, "Action": 0, "Adventure": 0}
        assert _is_horror(tags) is False

    # --- Layer 3: Steam genre ---

    def test_steam_genre_horror_no_tags(self):
        """No tags, but Steam genre is Horror → True (Layer 3)."""
        assert _is_horror({}, genres=["Horror"]) is True

    def test_steam_genre_psychological_horror(self):
        """Steam genre Psychological Horror → True."""
        assert _is_horror({}, genres=["Psychological Horror", "Indie"]) is True

    # --- Layer 4: Description only ---

    def test_description_only_horror_keyword(self):
        """No tags, no genre, but description contains 'haunted' → True (Layer 4)."""
        assert _is_horror({}, description="explore a haunted mansion filled with dark secrets") is True

    def test_description_only_terrifying(self):
        """Description contains 'terrifying' → True."""
        assert _is_horror({}, description="a terrifying survival experience") is True

    def test_darkwater_pattern(self):
        """Darkwater-style: Atmospheric + Horror + Survival Horror voted tags → True."""
        tags = {"Horror": 180, "Survival Horror": 140, "Atmospheric": 100, "Indie": 80}
        assert _is_horror(tags) is True

    def test_no_horror_signals_at_all(self):
        """Puzzle + Strategy + No Horror tag, no description, no genre → False."""
        assert _is_horror({"Puzzle": 200, "Strategy": 150, "Turn-Based": 100}) is False

    def test_empty_tags_no_description(self):
        """Empty tags, no description, no genre → False."""
        assert _is_horror({}) is False


# ---------------------------------------------------------------------------
# _is_indie tests
# ---------------------------------------------------------------------------

class TestIsIndie:
    def test_steam_indie_genre(self):
        """Steam says 'Indie' genre and publisher is not major → True."""
        assert _is_indie(["Indie", "Horror"], developer="TinyDev", publisher="TinyDev") is True

    def test_dev_equals_publisher_self_published(self):
        """Developer == Publisher → self-published → indie."""
        assert _is_indie(["Horror"], developer="ShadowDev", publisher="ShadowDev") is True

    def test_known_indie_publisher(self):
        """Publisher in INDIE_PUBLISHERS → indie."""
        assert _is_indie(["Horror"], developer="SomeDev", publisher="DreadXP") is True

    def test_major_publisher_not_indie(self):
        """Publisher contains 'electronic arts' → NOT indie regardless of Indie genre."""
        assert _is_indie(["Indie", "Horror"], developer="SomeDev", publisher="Electronic Arts") is False

    def test_major_developer_not_indie(self):
        """Developer contains 'capcom' → NOT indie."""
        assert _is_indie(["Indie"], developer="Capcom Co., Ltd.", publisher="SomePublisher") is False

    def test_no_indie_genre_not_self_published_not_known(self):
        """No Indie genre, different dev/pub, unknown publisher → False."""
        assert _is_indie(["Horror", "Action"], developer="DevStudio", publisher="BigCorpPublisher") is False

    def test_konami_developer_not_indie(self):
        """Konami as developer token → not indie."""
        assert _is_indie(["Indie", "Horror"], developer="Konami Digital Entertainment", publisher="IndieLabel") is False


# ---------------------------------------------------------------------------
# Runner for direct execution
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import traceback

    horror_tests = TestIsHorror()
    indie_tests = TestIsIndie()

    test_methods = [
        (horror_tests, [m for m in dir(horror_tests) if m.startswith("test_")]),
        (indie_tests, [m for m in dir(indie_tests) if m.startswith("test_")]),
    ]

    total = passed = 0
    print("\n=== Horror Classifier Tests ===")
    for instance, methods in test_methods:
        class_name = type(instance).__name__
        print(f"\n{class_name}:")
        for method_name in methods:
            total += 1
            try:
                getattr(instance, method_name)()
                print(f"  [PASS] {method_name}")
                passed += 1
            except AssertionError:
                print(f"  [FAIL] {method_name}")
            except Exception as e:
                print(f"  [ERROR] {method_name}: {e}")
                traceback.print_exc()

    print(f"\n{'=' * 40}")
    print(f"Results: {passed}/{total} passed")
    if passed < total:
        print("SOME TESTS FAILED")
        sys.exit(1)
    else:
        print("ALL TESTS PASSED")
