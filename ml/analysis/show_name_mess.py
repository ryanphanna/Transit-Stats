import pandas as pd

df = pd.read_csv("ml/trips.csv")

# Look for anything at the College + Spadina area
mask = (
    df["start_stop"].str.contains("college.*spadina|spadina.*college", case=False, na=False, regex=True) |
    df["end_stop"].str.contains("college.*spadina|spadina.*college", case=False, na=False, regex=True)
)

samples = df[mask][["start_stop", "end_stop", "route"]].head(15)

print("Real examples from your data of the *exact same physical place* (College + Spadina area)\n")
print("being recorded under many different names:\n")

for _, row in samples.iterrows():
    print(f"start: {row['start_stop']}")
    print(f"end:   {row['end_stop']}")
    print(f"route: {row['route']}")
    print("-" * 60)
