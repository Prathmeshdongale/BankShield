"""
transaction.py — Pydantic schema for the /predict request body.

All fields except `amount` are optional so the API degrades gracefully when
called from the Express transactionService.js scoreTransaction hook which
may not have the full context available yet.
"""

from pydantic import BaseModel, Field
from pydantic import ConfigDict
from typing import Optional


class TransactionFeatures(BaseModel):
    model_config = ConfigDict(json_schema_extra={
        "example": {
            "amount"               : 75000,
            "hour_of_day"          : 2,
            "day_of_week"          : 6,
            "account_balance"      : 120000,
            "account_mean_txn"     : 3500,
            "account_std_txn"      : 2000,
            "velocity_1h"          : 4,
            "velocity_24h"         : 12,
            "amount_sum_1h"        : 210000,
            "distinct_merchants_24h": 6,
            "merchant_category"    : "crypto",
            "country_mismatch"     : True,
            "is_new_device"        : True,
            "is_new_beneficiary"   : False,
            "card_type"            : "credit",
            "channel"              : "web",
        }
    })
    # ── Required ──────────────────────────────────────────────────────────────
    amount: float = Field(..., gt=0, description="Transaction amount (INR or local currency)")

    # ── Temporal ──────────────────────────────────────────────────────────────
    hour_of_day: Optional[int]   = Field(None, ge=0, le=23,
                                         description="Hour 0–23 (UTC). Defaults to current hour.")
    day_of_week: Optional[int]   = Field(None, ge=0, le=6,
                                         description="0=Mon … 6=Sun. Defaults to current weekday.")

    # ── Account context ───────────────────────────────────────────────────────
    account_balance:    Optional[float] = Field(10_000.0, ge=0,
                                                description="Current account balance")
    account_mean_txn:   Optional[float] = Field(None,
                                                description="Historical mean transaction size for this account")
    account_std_txn:    Optional[float] = Field(None,
                                                description="Historical std deviation of transaction size")

    # ── Velocity features ─────────────────────────────────────────────────────
    velocity_1h:             Optional[int]   = Field(1, ge=0,
                                                     description="Transactions in last 1 hour from this account")
    velocity_24h:            Optional[int]   = Field(3, ge=0,
                                                     description="Transactions in last 24 hours")
    amount_sum_1h:           Optional[float] = Field(None, ge=0,
                                                     description="Total amount spent in last 1 hour")
    distinct_merchants_24h:  Optional[int]   = Field(1, ge=0,
                                                     description="Distinct merchants in last 24 hours")

    # ── Merchant / context ───────────────────────────────────────────────────
    merchant_category:  Optional[str]  = Field("", description="Merchant category string")
    country_mismatch:   Optional[bool] = Field(False,
                                               description="True if transaction country ≠ account home country")
    is_new_device:      Optional[bool] = Field(False,
                                               description="True if device fingerprint not seen in last 30 days")
    is_new_beneficiary: Optional[bool] = Field(False,
                                               description="True if destination account never received funds before")

    # ── Card / channel ────────────────────────────────────────────────────────
    card_type: Optional[str] = Field("debit",
                                     description="debit | credit | prepaid | virtual")
    channel:   Optional[str] = Field("web",
                                     description="web | mobile | atm | pos | upi | neft | rtgs | imps | branch | api")

    # ── Legacy fields (kept for backward compatibility) ───────────────────────
    source_account_id:      Optional[str] = Field(None)
    destination_account_id: Optional[str] = Field(None)
    ip_address:             Optional[str] = Field(None)
    location:               Optional[str] = Field(None,
                                                   description="Deprecated: use country_mismatch instead")
