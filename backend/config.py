from pydantic_settings import BaseSettings
from pydantic import field_validator


class ChannelConfig:
    def __init__(self, handle: str, name: str, match_mode: str = "title"):
        self.handle = handle
        self.name = name
        self.match_mode = match_mode  # "title" or "description"


SEED_CHANNELS = [
    # Original channels (verified)
    ChannelConfig(handle="@IGP", name="IGP"),
    ChannelConfig(handle="@thefoosterchannel", name="Fooster"),
    ChannelConfig(handle="@Insym", name="Insym", match_mode="title"),
    ChannelConfig(handle="@ManlyBadassHero", name="ManlyBadassHero", match_mode="description"),
    # Expanded network — verified indie/horror gaming focus
    ChannelConfig(handle="@cjugames", name="CJUGames"),           # 163K — "obscene amount of indie horror games"
    ChannelConfig(handle="@mrkravin", name="MrKravin"),           # 144K — 11 years of horror games, indie focus
    ChannelConfig(handle="@gamersault", name="GamerSault"),       # 528K — horror game stories & theories
    ChannelConfig(handle="@hghhorrorgameshouse", name="HGH Horror Games House"),  # 93K — indie gems to cult classics
    ChannelConfig(handle="@twoonto", name="Twoonto"),             # 171K — horror gaming + story games
    ChannelConfig(handle="@indiefuel", name="Indie Fuel"),        # 86K — FNaF fan-games + indie horror
]

# Substring tokens — matched case-insensitively against publisher AND developer fields.
# E.g. "capcom" matches "CAPCOM Co., Ltd.", "Capcom U.S.A., Inc.", etc.
MAJOR_PUBLISHER_TOKENS = frozenset({
    "konami", "capcom", "bandai namco", "sony interactive",
    "microsoft studios", "xbox game studios", "electronic arts",
    "ubisoft", "2k games", "activision", "square enix", "sega",
    "warner bros", "bethesda", "blizzard", "riot games",
    "take-two", "thq nordic", "deep silver", "focus entertainment",
    "505 games", "paradox interactive", "techland",
    "koei tecmo", "tecmo koei",
})

INDIE_PUBLISHERS = frozenset({
    "Critical Reflex", "Armor Games Studios", "tinyBuild",
    "DreadXP", "Feardemic", "Perp Games",
    "Fellow Traveller", "Raw Fury", "Devolver Digital",
    "New Blood Interactive", "Akupara Games", "Serenity Forge",
    "Chorus Worldwide", "Nightdive Studios", "Team17",
    "Dangen Entertainment", "Playism", "HOOK",
    "Annapurna Interactive", "Humble Games",
})

CORE_HORROR_TAGS = frozenset({
    # Primary horror tags
    "Horror", "Psychological Horror", "Survival Horror",
    # Sub-genre / thematic horror tags
    "Supernatural", "Creature Feature", "Zombies",
    "Lovecraftian", "Cosmic Horror", "Gothic",
    "Gore", "Violent", "Dark", "Jump Scare",
    "Creepy", "Demons", "Ghosts",
})

# Tags that are horror-adjacent but ambiguous — they appear in non-horror games.
# These only count as horror if description confirms or paired with a strong tag.
# Includes thematic tags (Lovecraftian, Gothic, etc.) that describe aesthetic, not
# gameplay — many strategy/RPG/card games use these without being horror.
AMBIGUOUS_HORROR_TAGS = frozenset({
    "Zombies", "Dark", "Violent", "Gore",
    "Demons", "Supernatural", "Ghosts",
    "Lovecraftian", "Cosmic Horror", "Gothic", "Creepy",
})

# Strong horror tags — unambiguously horror-focused.
STRONG_HORROR_TAGS = CORE_HORROR_TAGS - AMBIGUOUS_HORROR_TAGS

# Anti-horror tags — if a game's only horror signal is an ambiguous tag
# AND it has any of these, it is almost certainly not horror.
ANTI_HORROR_TAGS = frozenset({
    "Cartoon", "Cartoony", "Colorful", "Cute",
    "Comedy", "Funny", "Family Friendly", "Wholesome",
    "Relaxing", "Cozy",
})

# Non-horror genre tags — when a game's tag list is dominated by these
# and only has a minor/troll "Horror" tag, it's not a horror game.
NON_HORROR_GENRE_TAGS = frozenset({
    "Romance", "Dating Sim", "Visual Novel", "Sexual Content",
    "Farming Sim", "City Builder", "Tower Defense", "Puzzle",
    "Sports", "Racing", "Card Game", "Board Game",
    "Education", "Music", "Rhythm",
    "Open World Survival Craft", "Colony Sim", "Base Building",
})

# Broader keywords for description-based horror detection (Layer 3).
# Checked as substring matches against short_description + about_the_game.
HORROR_DESCRIPTION_KEYWORDS = [
    "horror", "terrif", "scare", "scary", "creepy", "haunt",
    "nightmar", "dread", "macabre", "grotesque", "sinister",
    "demonic", "paranormal", "supernatural", "disturbing",
    "frightening", "gruesome", "ghastly", "eerie", "ominous",
    "occult", "exorcis", "poltergeist", "asylum", "slaughter",
]


class Settings(BaseSettings):
    youtube_api_key: str = ""
    database_url: str = "sqlite:///./horrorindie.db"

    steam_discovery_interval_hours: int = 6
    steam_reviews_interval_hours: int = 24
    steam_ccu_interval_hours: int = 6
    steam_owners_interval_hours: int = 24
    youtube_scan_interval_hours: int = 24
    youtube_stats_interval_hours: int = 24
    ops_interval_hours: int = 24

    fuzzy_match_threshold: int = 85
    fuzzy_min_title_length: int = 4
    fuzzy_generic_terms: str = "content warning,the game,horror game,scary game,indie game,new game,this game,horror,scary,indie,survival,zombie,zombies,ghost,demon,fear"

    log_level: str = "INFO"

    # OPS v5 formula weights (active components, redistribute on NULL)
    ops_velocity_weight: float = 0.30       # age-adjusted velocity (primary signal)
    ops_decay_weight: float = 0.20          # velocity decay rate
    ops_review_weight: float = 0.13         # review volume vs peers
    ops_youtube_weight: float = 0.13        # YT engagement (views/subs ratio + breadth)
    ops_ccu_weight: float = 0.10            # peak CCU vs peers, with age decay
    ops_sentiment_weight: float = 0.08      # review sentiment trend (NEW v5)
    ops_twitch_weight: float = 0.06         # twitch viewer/streamer engagement (NEW v5)
    ops_ccu_decay_days: int = 14
    ops_score_multiplier: float = 24.0

    # Age-adjusted velocity: expected reviews/day by age bracket
    ops_velocity_baseline_week1: float = 1.14    # median from data
    ops_velocity_baseline_week2_4: float = 0.14
    ops_velocity_baseline_month2_3: float = 0.03

    # Price modifier brackets (applied to review component only)
    ops_price_free: float = 0.6
    ops_price_under5: float = 0.85
    ops_price_5to10: float = 1.0
    ops_price_10to20: float = 1.15
    ops_price_over20: float = 1.3

    # YouTube sub-weights
    ops_yt_view_subweight: float = 0.6
    ops_yt_breadth_subweight: float = 0.4
    ops_yt_median_views_subs_ratio: float = 0.074  # median from data

    # Twitch
    twitch_client_id: str = ""
    twitch_client_secret: str = ""
    twitch_interval_hours: int = 6

    # Reddit
    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    reddit_user_agent: str = "HorrorRadar/1.0"
    reddit_interval_hours: int = 24
    reddit_subreddits: str = "HorrorGaming,IndieGaming"  # r/Steam etc. only for games with ≥100 reviews

    # Steam extras (achievements + update tracking)
    steam_extras_interval_hours: int = 24

    # Developer profiles
    dev_profile_interval_hours: int = 168  # weekly

    # CORS — comma-separated additional origins (e.g. your Vercel URL)
    cors_origins: str = ""

    # Sentry — leave empty to disable error tracking
    sentry_dsn: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
