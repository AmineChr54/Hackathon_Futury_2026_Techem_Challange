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

def print_section(title: str):
    print("\n" + "="*80)
    print(f"🔹 {title}".upper())
    print("="*80)

def main():
    print(f"🚀 Starting Techem Landlord-Facing Features Demo for Property {PID}...\n")

    # 1. Dashboard Usage
    print_section("1. Property Usage & Efficiency (/landlord/property/{pid}/usage)")
    try:
        r = requests.get(f"{BASE_URL}/landlord/property/{PID}/usage")
        r.raise_for_status()
        data = r.json()
        print(f"Total Units: {data['total_units']}")
        print(f"Living Space: {data['total_livingspace_m2']:.0f} m²")
        print(f"Total Energy: {data['total_kwh']:.0f} kWh")
        print(f"Total Cost: {data['total_cost_eur']:.2f} €")
        print(f"Total CO₂: {data['total_co2_kg']:.0f} kg")
        print(f"Efficiency: {data['efficiency_kwh_per_m2_yr']:.0f} kWh/m²/yr")
        print(f"Energy Score: {data['energy_score']} Grade")
    except Exception as e:
        print(f"Failed: {e}")

    time.sleep(1)

    # 2. AI Coacher / Insights
    print_section("2. AI Coacher Insights (/landlord/property/{pid}/insights)")
    try:
        r = requests.get(f"{BASE_URL}/landlord/property/{PID}/insights")
        r.raise_for_status()
        data = r.json()
        print(data["summary"])
        if data.get("narrative"):
            print("\n🤖 AI Coach Analysis:")
            print(f"  {data['narrative']}\n")
    except Exception as e:
        print(f"Failed: {e}")

    time.sleep(1)

    # 3. ROI
    print_section("3. ROI & Financial Incentives (/landlord/property/{pid}/roi)")
    try:
        r = requests.get(f"{BASE_URL}/landlord/property/{PID}/roi")
        r.raise_for_status()
        data = r.json()
        print(f"Current Carbon Tax (Est.): {data['current_carbon_tax_eur']:.2f} €")
        print(f"Potential Carbon Tax Savings: {data['potential_carbon_tax_savings_eur']:.2f} €")
        print(f"Potential Property Value Increase (1 Grade jump): {data['potential_property_value_increase_eur']:,.2f} €")
    except Exception as e:
        print(f"Failed: {e}")

    time.sleep(1)

    # 4. ESG Report
    print_section("4. ESG Executive Report (/landlord/property/{pid}/esg_report)")
    try:
        r = requests.get(f"{BASE_URL}/landlord/property/{PID}/esg_report")
        r.raise_for_status()
        data = r.json()
        
        env = data["metrics"]["environmental"]
        print(f"Environmental: {env['total_co2_kg']:.0f} kg CO2, {env['carbon_intensity_kg_per_m2']:.2f} kg CO2/m2, Score {env['energy_score']}")
        
        if data.get("narrative"):
            print("\n🤖 AI ESG Executive Summary:")
            print(f"  {data['narrative']}\n")
    except Exception as e:
        print(f"Failed: {e}")

    print("\n" + "="*80)
    print("✅ Demo Complete!")

if __name__ == "__main__":
    main()
