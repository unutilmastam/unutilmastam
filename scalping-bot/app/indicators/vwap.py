"""Session VWAP (volume weighted average price).

The session resets at 00:00 UTC, which is the convention Binance charts use
for spot pairs. VWAP is cumulative inside a session, so it is naturally
causal.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

_DAY_MS = 86_400_000


def vwap(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    volume: pd.Series,
    open_time: pd.Series | None = None,
) -> pd.Series:
    """Session VWAP based on the typical price.

    ``open_time`` holds candle open timestamps in milliseconds. When it is
    omitted the whole series is treated as one session.
    """
    high = pd.Series(high, dtype="float64").reset_index(drop=True)
    low = pd.Series(low, dtype="float64").reset_index(drop=True)
    close = pd.Series(close, dtype="float64").reset_index(drop=True)
    volume = pd.Series(volume, dtype="float64").reset_index(drop=True).fillna(0.0)

    typical = (high + low + close) / 3.0
    pv = typical * volume

    if open_time is None:
        session = pd.Series(0, index=typical.index)
    else:
        times = pd.Series(open_time, dtype="int64").reset_index(drop=True)
        session = times // _DAY_MS

    cum_pv = pv.groupby(session).cumsum()
    cum_volume = volume.groupby(session).cumsum()

    result = np.where(cum_volume > 0, cum_pv / cum_volume.replace(0, np.nan), typical)
    return pd.Series(result, index=typical.index, dtype="float64")
