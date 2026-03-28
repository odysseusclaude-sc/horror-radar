from pydantic_settings import BaseSettings
from pydantic import field_validator


class ChannelConfig:
    def __init__(self, handle: str, name: str, match_mode: str = "title"):
        self.handle = handle
        self.name = name
        self.match_mode = match_mode  # "title" or "description"


SEED_CHANNELS = [
    ChannelConfig(handle="@IGP", name="IGP"),
    ChannelConfig(handle="@Fooster", name="Fooster"),
    ChannelConfig(handle="@Insym", name="Insym", match_mode="title"),
    ChannelConfig(handle="@ManlyBadassHero", name="ManlyBadassHero", match_mode="description"),
]

MAJOR_PUBLISHERS = frozenset({
    "Konami", "Capcom", "Bandai Namco", "Sony Interactive Entertainment",
    "Microsoft Studios", "Electronic Arts", "Ubisoft", "2K Games",
    "Activision", "Square Enix", "Sega",
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
    log_level: str = "INFO"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
