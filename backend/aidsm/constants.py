"""Fixed definitions shared by the engine, the API and the import/export layer.

Everything here mirrors 18_Technical_Config and the fixed labels of the v1.5 workbook.
"""

MODEL_NAME = "AI Investment Decision-Support Model"
MODEL_VERSION = "1.5 (Final)"
ENGINE_VERSION = "web-1.0"
MAX_YEARS = 15

ALT_IDS = ["RES-MOD", "RES-ADV", "CUS-01", "CUS-02", "CUS-03"]
BENCHMARK_IDS = ("RES-MOD", "RES-ADV")

RISK_IDS = ["RSK-EXP", "RSK-MOD", "RSK-DAT", "RSK-TPD", "RSK-CYB", "RSK-CUS", "RSK-GOV"]
RISK_NAMES = ["Explainability", "Model risk", "Data quality", "Third-party dependence",
              "Cybersecurity", "Customer impact", "Governance burden"]
RISK_DEFINITIONS = [
    "Difficulty in explaining why an AI alert or decision was generated.",
    "Risk that the AI model performs poorly, drifts over time or produces unreliable outputs.",
    "Poor, biased or incomplete data weakening model performance.",
    "Reliance on external suppliers creating operational and governance risk.",
    "AI systems increasing exposure to cyber threats or data leakage.",
    "Incorrect interventions inconveniencing customers.",
    "Residual regulatory and accountability exposure remaining after budgeted governance and validation costs.",
]
BENCHMARK_WEIGHTS = [0.2, 0.2, 0.15, 0.15, 0.1, 0.1, 0.1]
BENCHMARK_LAMBDA = 0.4
SCORE_MEANING = {1: "Low / well-understood risk with established controls",
                 2: "Minor risk with controls largely in place",
                 3: "Material risk requiring additional controls",
                 4: "Significant risk with limited proven controls",
                 5: "Severe risk / major unresolved control concern"}

# Validation lists (18_Technical_Config rows 49-60)
LIST_CASE_STATUS = ["Draft", "Under Review", "Approved Case", "Monitoring"]
LIST_SOURCE_TYPE = ["Bank internal data", "Public evidence", "Peer-reviewed evidence",
                    "Regulatory/institutional evidence", "Vendor estimate", "Research benchmark",
                    "User assumption"]
LIST_CONFIDENCE = ["High", "Medium", "Low"]
LIST_BENEFIT_METHOD = ["Driver-based %", "Workload driver", "Detailed event driver",
                       "Direct estimate", "Not monetised"]
LIST_CRITICAL = ["No critical issue", "Critical issue unresolved", "Not assessed"]
LIST_ALT_TYPE = ["Research Benchmark", "Custom"]
LIST_DIST = ["Triangular", "Uniform", "Truncated Normal"]
LIST_ITERATIONS = [1000, 5000, 10000, 25000, 50000]
LIST_MONITOR_STATUS = ["On Track", "Attention Required", "Formal Reassessment Required"]
LIST_MONITOR_EVIDENCE = ["Unchanged since approval", "Resolved by pilot evidence",
                         "High", "Medium", "Low"]

LEVEL_LABELS = [
    "R0 - Assessment Incomplete",
    "R1 - Do Not Proceed Under Current Assumptions",
    "R2 - Revise and Reassess",
    "R3 - Proceed to Controlled Pilot / Evidence Gathering",
    "R4 - Conditional Proceed",
    "R5 - Proceed",
]

# Monte Carlo: the ten uncertain inputs held for every alternative, and their permitted domains
MC_VARIABLES = [
    ("BEN-FRAUD-RED", "Fraud-loss reduction", "%"),
    ("CST-VENDOR", "Vendor / licensing cost", "R m/year"),
    ("CST-MAINT-MON", "Maintenance and monitoring cost", "R m/year"),
    ("BEN-CASE-RED", "Case-handling reduction", "%"),
    ("BEN-FP-RED", "False-positive reduction", "%"),
    ("BEN-RAMP-MULT", "Benefit ramp multiplier", "Ratio"),
    ("CST-INIT-TOTAL", "Initial implementation cost", "R m"),
    ("CST-REC-TOTAL", "Recurring annual cost", "R m/year"),
    ("BL-FRAUD-EXP", "Baseline fraud-loss exposure", "R m/year"),
    ("RSK-LAMBDA", "Risk penalty coefficient (lambda)", "Ratio"),
]
MC_DOMAINS = {
    "BEN-FRAUD-RED": (-1.0, 1.0), "BEN-CASE-RED": (-1.0, 1.0), "BEN-FP-RED": (-1.0, 1.0),
    "BEN-RAMP-MULT": (0.0, 1.0), "CST-INIT-TOTAL": (0.0, 100000.0), "CST-REC-TOTAL": (0.0, 100000.0),
    "CST-VENDOR": (0.0, 100000.0), "CST-MAINT-MON": (0.0, 100000.0), "BL-FRAUD-EXP": (0.0, 100000.0),
    "RSK-LAMBDA": (0.0, 1.0),
}

# One-way sensitivity: the 22 grid variables in workbook order (09_Sensitivity rows 65-174)
SENS_VARIABLES = [
    ("BEN-FRAUD-RED", "Fraud-loss reduction"),
    ("BEN-CASE-RED", "Case-handling reduction"),
    ("BEN-FP-RED", "False-positive reduction"),
    ("BEN-WORK-RED", "Analyst workload reduction"),
    ("BEN-FP-EVENT", "Cost per avoided false-positive event"),
    ("BEN-RAMP-MULT", "Benefit ramp"),
    ("CST-INIT-TOTAL", "Initial implementation cost"),
    ("CST-REC-TOTAL", "Recurring annual cost (aggregate)"),
    ("CST-VENDOR", "Vendor / licensing cost"),
    ("CST-MAINT-MON", "Maintenance and monitoring cost"),
    ("FIN-HORIZON", "Evaluation horizon"),
    ("FIN-RATE", "Discount rate"),
    ("RSK-LAMBDA", "Risk penalty coefficient (lambda)"),
    ("RSK-RI", "Overall risk index (aggregate)"),
    ("RSK-EXP", "Explainability risk score"),
    ("RSK-MOD", "Model risk score"),
    ("RSK-DAT", "Data quality risk score"),
    ("RSK-TPD", "Third-party dependence risk score"),
    ("RSK-CYB", "Cybersecurity risk score"),
    ("RSK-CUS", "Customer impact risk score"),
    ("RSK-GOV", "Governance burden risk score"),
    ("BL-FRAUD-EXP", "Baseline fraud-loss exposure"),
]
SENS_FACTORS = [0.8, 0.9, 1.0, 1.1, 1.2]
SENS_POINT_LABELS = ["-20%", "-10%", "Base", "+10%", "+20%"]

# Control-panel parameter list (09_Sensitivity rows 8-30, the selectable variables)
PANEL_PARAMETERS = [
    ("Fraud-loss reduction", "BEN-FRAUD-RED"), ("Case-handling reduction", "BEN-CASE-RED"),
    ("False-positive reduction", "BEN-FP-RED"), ("Other unique monetised benefit", "BEN-OTH-VAL"),
    ("Benefit ramp multiplier", "BEN-RAMP-MULT"), ("Initial implementation cost", "CST-INIT-TOTAL"),
    ("Recurring annual cost", "CST-REC-TOTAL"), ("Vendor / licensing cost", "CST-VENDOR"),
    ("Maintenance and monitoring cost", "CST-MAINT-MON"), ("Evaluation horizon", "FIN-HORIZON"),
    ("Discount rate", "FIN-RATE"), ("Risk penalty coefficient (lambda)", "RSK-LAMBDA"),
    ("Risk index", "RSK-RI"), ("Explainability score", "RSK-EXP"), ("Model risk score", "RSK-MOD"),
    ("Data quality score", "RSK-DAT"), ("Third-party dependence score", "RSK-TPD"),
    ("Cybersecurity score", "RSK-CYB"), ("Customer impact score", "RSK-CUS"),
    ("Governance burden score", "RSK-GOV"), ("Baseline fraud-loss exposure", "BL-FRAUD-EXP"),
    ("Baseline case-handling cost", "BL-CASE-COST"), ("Baseline false-positive cost", "BL-FP-COST"),
    ("Analyst workload reduction", "BEN-WORK-RED"), ("Cost per avoided false-positive event", "BEN-FP-EVENT"),
]

# Driver-impact block: the 13 variables ranked for every alternative (09_Sensitivity rows 280-344)
DRIVER_VARIABLES = [
    ("BEN-FRAUD-RED", "Fraud-loss reduction"), ("BEN-CASE-RED", "Case-handling reduction"),
    ("BEN-FP-RED", "False-positive reduction"), ("BEN-WORK-RED", "Analyst workload reduction"),
    ("BEN-FP-EVENT", "Cost per avoided false-positive event"), ("BEN-RAMP-MULT", "Benefit ramp"),
    ("CST-INIT-TOTAL", "Initial implementation cost"), ("CST-REC-TOTAL", "Recurring annual cost"),
    ("FIN-HORIZON", "Evaluation horizon"), ("FIN-RATE", "Discount rate"),
    ("RSK-LAMBDA", "Risk penalty coefficient (lambda)"), ("RSK-RI", "Overall risk index"),
    ("BL-FRAUD-EXP", "Baseline fraud-loss exposure"),
]

INITIAL_COST_ITEMS = [("implement", "CST-IMPLEMENT", "Initial implementation / development"),
                      ("integrate", "CST-INTEGRATE", "Systems integration"),
                      ("train", "CST-TRAIN-INIT", "Initial training / change management"),
                      ("data", "CST-DATA-INIT", "Initial data preparation"),
                      ("governance", "CST-GOV-INIT", "Initial governance / validation set-up"),
                      ("other", "CST-OTHER-INIT", "Other initial cost")]
RECURRING_COST_ITEMS = [("vendor", "CST-VENDOR", "Vendor / licensing"),
                        ("data", "CST-DATA", "Data preparation and maintenance"),
                        ("train", "CST-TRAIN", "Training / change management"),
                        ("maintenance", "CST-MAINT", "Maintenance"),
                        ("monitoring", "CST-MONITOR", "Monitoring"),
                        ("governance", "CST-GOV", "Governance / validation"),
                        ("other", "CST-OTHER-REC", "Other recurring cost")]

MON_BENEFIT_CATS = [("fraud", "MON-BEN-FRAUD", "Fraud losses avoided"),
                    ("case", "MON-BEN-CASE", "Case / analyst workload saving"),
                    ("fp", "MON-BEN-FP", "False-positive / customer-friction saving"),
                    ("other", "MON-BEN-OTH", "Other approved unique benefit")]
MON_COST_CATS = [("impl", "MON-CST-IMPL", "Implementation / integration"),
                 ("vendor", "MON-CST-VENDOR", "Vendor / licensing"),
                 ("data", "MON-CST-DATA", "Data, maintenance and monitoring"),
                 ("train", "MON-CST-TRAIN", "Training / change management"),
                 ("gov", "MON-CST-GOV", "Governance / validation"),
                 ("other", "MON-CST-OTHER", "Other material cost")]
MON_KPIS = ["Alerts per year", "False-positive rate", "Analyst hours", "Case volume", "Average resolution time"]

NO_RECORD = "No evidence record"
