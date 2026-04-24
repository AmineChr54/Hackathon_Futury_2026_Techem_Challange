"""
Demonstration script for the Tenant-Facing AI Features.

This script interacts with the Techem Prediction Engine API to showcase:
1. Real-time intraday consumption (/today)
2. Cohort comparisons and equivalents (/peers)
3. Ranked energy-saving recommendations (/recommendations)
4. Four-signal anomaly and leak detection (/leaks)
5. AI-driven target planning (/target)
6. Conversational assistant tool-calling (/chat)

Ensure the server is running on http://127.0.0.1:8000 before executing.
"""
import requests
import json
import time
import sys
import codecs

# Force UTF-8 output for Windows console
if sys.stdout.encoding != 'utf-8':
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

BASE_URL = "http://127.0.0.1:8000"
PID = 1
UID = 1

def print_section(title: str):
    print("\n" + "="*80)
    print(f"🔹 {title}".upper())
    print("="*80)

def print_json(data: dict):
    print(json.dumps(data, indent=2, ensure_ascii=False))

def main():
    print(f"🚀 Starting Techem Tenant-Facing Features Demo for Property {PID}, Unit {UID}...\n")
    
    # 1. Today's Consumption
    print_section("1. Intra-day Consumption Tracker (/today)")
    print("Fetching today's energy usage, projected end-of-day cost, and CO₂ emissions...")
    try:
        r = requests.get(f"{BASE_URL}/today/{PID}/{UID}")
        r.raise_for_status()
        data = r.json()
        print(f"As of hour {data['as_of_hour']}:00 today:")
        print(f"  - kWh so far: {data['kwh_so_far']:.2f} kWh (Projected full day: {data['kwh_full_day']:.2f} kWh)")
        print(f"  - Cost so far: {data['cost_eur_so_far']:.2f} € (Projected full day: {data['cost_eur_full_day']:.2f} €)")
        print(f"  - CO₂ so far: {data['co2_g_so_far']/1000:.2f} kg (Projected full day: {data['co2_g_full_day']/1000:.2f} kg)")
        print(f"  - Compared to yesterday: {data['vs_yesterday_pct']}%")
    except Exception as e:
        print(f"Failed: {e}")

    time.sleep(1)

    # 2. Peer Comparison
    print_section("2. Enhanced Peer Comparison (/peers)")
    print("Benchmarking tenant against similar units with fun equivalents...")
    try:
        r = requests.get(f"{BASE_URL}/peers/{PID}/{UID}")
        r.raise_for_status()
        data = r.json()
        print(f"Badge Earned: {data['badge']}")
        print(f"Percentile Rank: Better than {data['percentile_rank_better_than']}% of peers")
        print(f"Usage vs Median: {data['vs_median_pct']}%")
        print("\nIf you matched the top 20% of peers, you could save:")
        print(f"  - {data['aspirational_saving_eur']:.2f} € per year")
        print("\nYour usage is equivalent to:")
        print(f"  - 🌳 {data['equivalents']['trees_equivalent']} trees absorbing CO₂")
        print(f"  - 🚗 {data['equivalents']['km_driven_equivalent']} km driven in a car")
        print(f"  - 📱 {data['equivalents']['phone_charges_equivalent']} smartphone charges")
    except Exception as e:
        print(f"Failed: {e}")

    time.sleep(1)

    # 3. Recommendations
    print_section("3. Energy-Saving Recommendations (/recommendations)")
    print("Ranking actionable recommendations based on setpoint, behavior, and insulation...")
    try:
        r = requests.get(f"{BASE_URL}/recommendations/{PID}/{UID}")
        r.raise_for_status()
        data = r.json()
        
        if data.get('narrative'):
            print("🤖 AI Summary:")
            print(f"  {data['narrative']}\n")
            
        print(f"Found {len(data['items'])} actions. Top 3 recommendations:")
        for idx, item in enumerate(data['items'][:3], 1):
            print(f"  {idx}. {item['action']}")
            print(f"     -> Potential Saving: {item['monthly_eur_saving']:.2f} € / month | Confidence: {item['confidence'].upper()} | Source: {item['source']}")
    except Exception as e:
        print(f"Failed: {e}")

    time.sleep(1)

    # 4. Leak Detection
    print_section("4. Four-Signal Anomaly & Leak Detection (/leaks)")
    print("Running advanced diagnostics (insulation, spikes, room shares, stuck sensors)...")
    try:
        r = requests.get(f"{BASE_URL}/leaks/{PID}/{UID}")
        r.raise_for_status()
        data = r.json()
        
        if data.get('narrative'):
            print("🤖 AI Explanation:")
            print(f"  {data['narrative']}\n")
            
        print(f"Overall Status: {data['summary']['overall_status'].replace('_', ' ').title()}")
        print(f"Signals Detected: {data['summary']['total_signals']}")
        for sig in data['raw_signals']:
            print(f"  - [{sig['severity'].upper()}] {sig['kind'].replace('_', ' ').title()} in Room {sig['room_id'] if sig['room_id'] else 'Unknown'}")
            print(f"    Details: {sig['details']}")
    except Exception as e:
        print(f"Failed: {e}")

    time.sleep(1)

    # 5. Target Setting
    print_section("5. Goal-Driven Planner (/target)")
    print("Setting an ambitious target of 70€ for the next 30 days and asking AI for a plan...")
    try:
        payload = {"target_value": 70, "target_unit": "EUR", "horizon_days": 30}
        r = requests.post(f"{BASE_URL}/target/{PID}/{UID}", json=payload)
        r.raise_for_status()
        data = r.json()
        
        print(f"Projected Baseline Cost: {data['projected']:.2f} €")
        print(f"Target Cost: {data['target']:.2f} €")
        print(f"Gap to Close: {data['gap']:.2f} €")
        print(f"Is Target Feasible? {'Yes' if data['feasible'] else 'Likely No (Too ambitious)'}\n")
        
        print("🤖 AI Target Plan:")
        print(data['plan_narrative'])
    except Exception as e:
        print(f"Failed: {e}")

    time.sleep(1)

    # 6. Chatbot
    print_section("6. Conversational AI Chatbot (/chat)")
    print("Asking the chatbot an open-ended diagnostic question...")
    try:
        payload = {"message": "My energy bills feel high. Are any of my rooms wasting energy or badly insulated? Please check the data."}
        print(f"👤 Tenant: \"{payload['message']}\"\n")
        
        r = requests.post(f"{BASE_URL}/chat/{PID}/{UID}", json=payload)
        r.raise_for_status()
        data = r.json()
        
        print(f"🤖 Agnes (AI Assistant):")
        print(data['reply'])
        print("\n🔧 Tools Called behind the scenes:")
        print(data['tools_called'])
    except Exception as e:
        print(f"Failed: {e}")

    print("\n" + "="*80)
    print("✅ Demo Complete!")

if __name__ == "__main__":
    main()
