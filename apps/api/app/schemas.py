"""Base classes for every request and response model (D028)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ApiModel(BaseModel):
    """Unknown fields are rejected; strings are stripped; models are frozen."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, frozen=True)
