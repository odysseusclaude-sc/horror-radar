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

MAJOR_PUBLISHERS = frozenset({
    "Konami", "Capcom", "Bandai Namco", "Sony Interactive Entertainment",
    "Microsoft Studios", "Electronic Arts", "Ubisoft", "2K Games",
    "Activision", "Square Enix", "Sega",
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
    "Horror", "Psychological Horror", "Survival Horror",
    "Supernatural", "Creature Feature", "Zombies",
})


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
    fuzzy_generic_terms: str = "content warning,the game,horror game,scary game,indie game,new game,this game"

    log_level: str = "INFO"

    # OPS formula weights (active components, redistribute on NULL)
    ops_review_weight: float = 0.30
    ops_velocity_weight: float = 0.25
    ops_youtube_weight: float = 0.25
    ops_ccu_weight: float = 0.20
    ops_ccu_decay_days: int = 14
    ops_score_multiplier: float = 40.0

    # Price modifier brackets
    ops_price_free: float = 0.6
    ops_price_under5: float = 0.85
    ops_price_5to10: float = 1.0
    ops_price_10to20: float = 1.15
    ops_price_over20: float = 1.3

    # YouTube sub-weights
    ops_yt_view_subweight: float = 0.6
    ops_yt_breadth_subweight: float = 0.4

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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
