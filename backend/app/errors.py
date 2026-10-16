"""Application exceptions with stable API-level meanings."""


class ModelConfigurationError(Exception):
    """The configured model cannot be called because configuration is missing."""


class ModelProviderError(Exception):
    """The external model provider failed to complete a request."""


class EmptyModelResponseError(Exception):
    """The model call completed without usable response text."""


class CharacterConfigurationError(Exception):
    """The authoritative character configuration is missing or invalid."""
