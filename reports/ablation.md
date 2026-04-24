# Feature ablation — L2 Tweedie, blocked 30-day CV

Each row drops one feature group from the full model and retrains with otherwise identical hyperparameters. `delta_mae` is the MAE regression vs. the full model — the larger the number, the more important the feature group.

| ablation | dropped columns | n | MAE | ΔMAE | Δ% |
|---|---|---:|---:|---:|---:|
| none (full) | (full model) | 40,509 | 3.9678 | +0.0000 | +0.0% |
| no_weather | outside_temp, temp_roll1, temp_roll3, temp_roll7 | 40,509 | 5.1119 | +1.1441 | +28.8% |
| no_hdd | hdd_12, hdd_15, hdd_18 | 40,509 | 4.0229 | +0.0551 | +1.4% |
| no_calendar | dow, doy_cos, doy_sin, is_weekend, month_cos, month_sin | 40,509 | 3.7913 | -0.1765 | -4.4% |
| no_lags | kwh_lag1, kwh_lag_roll1, kwh_lag_roll3, kwh_lag_roll7 | 40,509 | 6.8993 | +2.9316 | +73.9% |
| no_unit_attrs | unit_livingspace, unit_n_rooms | 40,509 | 4.0156 | +0.0478 | +1.2% |
