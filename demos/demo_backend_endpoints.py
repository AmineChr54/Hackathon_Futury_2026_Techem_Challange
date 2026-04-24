import subprocess
import time
import httpx
import os

def main():
    print("Starting FastAPI server...")
    env = os.environ.copy()
    env["PYTHONPATH"] = "src"
    proc = subprocess.Popen(["python", "-m", "uvicorn", "techem.serve.api:app", "--port", "8123"], env=env)
    time.sleep(5) # wait for startup

    try:
        base_url = "http://127.0.0.1:8123"
        
        print("\n--- 1. Health & Units ---")
        health = httpx.get(f"{base_url}/health").json()
        print(f"Health: {health}")
        
        units = httpx.get(f"{base_url}/units").json()
        print(f"Total units available: {len(units)}")
        target_unit = units[0]
        pid, uid = target_unit["property_id"], target_unit["unit_id"]
        print(f"Using target unit: Property {pid}, Unit {uid}")

        print(f"\n--- 2. /forecast (Point + Conformal Quantiles) ---")
        forecast = httpx.get(f"{base_url}/forecast/unit/{pid}/{uid}?horizon_days=7").json()
        print(f"Forecast keys: {list(forecast.keys())}")
        print(f"Total projected kWh: {forecast['total_point_kwh']:.2f}")
        for pt in forecast["series"][:2]:
            print(f"  {pt['date']}: point={pt['point_kwh']:.2f}, q10={pt['q10_kwh']:.2f}, q90={pt['q90_kwh']:.2f}")

        print(f"\n--- 3. /drilldown (Reconciliation) ---")
        drilldown = httpx.get(f"{base_url}/drilldown/unit/{pid}/{uid}?horizon_days=7").json()
        print(f"Room breakdown for {len(drilldown)} rooms:")
        for r in drilldown:
            print(f"  Room {r['room_id']}: share={r['share']:.2%}, total_kwh={r['total_point_kwh']:.2f}")

        print(f"\n--- 4. /whatif (Counterfactuals) ---")
        whatif = httpx.post(f"{base_url}/whatif/unit/{pid}/{uid}", json={"temp_delta_c": -1.0, "horizon_days": 30}).json()
        print(f"Baseline: {whatif['baseline_kwh']:.2f} kWh")
        print(f"Counterfactual (-1C): {whatif['counterfactual_kwh']:.2f} kWh")
        print(f"Delta: {whatif['delta_kwh']:.2f} kWh (Savings: {whatif['delta_cost_eur']:.2f} EUR)")

        print(f"\n--- 5. /peers (Cohort Comparison) ---")
        peers = httpx.get(f"{base_url}/peers/{pid}/{uid}").json()
        print(f"Cohort size: {peers['cohort_size']}")
        print(f"Percentile rank: better than {peers['percentile_rank_better_than']:.1f}% of cohort")
        print(f"Unit avg: {peers['unit_avg_daily_kwh']:.2f} kWh/day vs Cohort avg: {peers['cohort_avg_daily_kwh']:.2f} kWh/day")

        print(f"\n--- 6. /drift (Structural breaks) ---")
        drift = httpx.get(f"{base_url}/drift?property_id={pid}&unit_id={uid}").json()
        print(f"Recent drift events found: {len(drift)}")
        if drift:
            print(f"Top event p-value: {drift[0]['p_value']:.4f}")
            
    finally:
        print("\nShutting down server...")
        proc.terminate()
        proc.wait()

if __name__ == '__main__':
    main()
