import csv


def load(path):
    with open(path) as f:
        return list(csv.DictReader(f))


def average_weight(rows):
    total = sum(float(r["weight"]) for r in rows)
    return total / len(rows)


print(average_weight(load("otters.csv")))
