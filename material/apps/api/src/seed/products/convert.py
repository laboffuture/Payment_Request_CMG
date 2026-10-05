"""Product lists (Excel) -> products.json, the data the item-master import loads.

    python convert.py "<PRODUCT_TREE_LIST...xlsx>" "<ELECTRICAL_AND_PLUMBING...xlsx>"

Each sheet is a main category; the CATEGORY (INDICATIVE) column is its sub-category.
Writes products.json and products-report.txt beside this file. Rules, all reported:
  - exact repeats (same name, brand, unit and pack) are kept once
  - a name used for different products gets the brand, then the pack, added
  - a code used for different products gets the brand (or a number) added
  - a missing code is generated; a missing unit becomes Nos
  - units are normalised to the app's list (MTR -> Lm, L/LITTER -> Ltr, PACK -> Pkt ...)
"""
import json, re, sys, collections
from pathlib import Path
import openpyxl

HERE = Path(__file__).parent

CATEGORY = {  # sheet -> main category, and its code prefix for generated codes
    'CIVIL': ('Civil', 'CVL'), 'CNS': ('Consumables', 'CNS'), 'PAINT': ('Paint', 'PT'),
    'GPYSUM': ('Gypsum', 'GYP'), 'GYPSUM': ('Gypsum', 'GYP'), 'STEEL': ('Steel', 'STL'),
    'JOINERY ITEMS': ('Joinery', 'JO'), 'ELECTRICAL': ('Electrical', 'ELE'),
    'PLUMBING': ('Plumbing', 'PLB'),
    # an unnamed sheet of tools and site consumables, with no headings or codes
    'SHEET1': ('General', 'GEN'),
}
# Sheet1 has no PRODUCT NAME heading; its columns, by position.
SHEET1_COLS = {'S.NO': 0, 'PRODUCT CODE': 1, 'PRODUCT NAME': 2, 'BRAND/MAKE': 3, 'UNITS': 4,
               'UNIT VOLUME': 5, 'REMARKS': 6, 'GST RATE (%)': 8, 'HSN CODE (INDICATIVE)': 9,
               'CATEGORY (INDICATIVE)': 10}
UNIT = {
    'NOS': 'Nos', 'NO': 'Nos', 'MTR': 'Lm', 'LM': 'Lm', 'M': 'Lm', 'ROLL': 'Roll', 'KG': 'Kg',
    'LTR': 'Ltr', 'L': 'Ltr', 'LITTER': 'Ltr', 'LITRE': 'Ltr', 'PKT': 'Pkt', '1 PKT': 'Pkt',
    'PACK': 'Pkt', 'BAG': 'Bag', 'BUCKET': 'Bucket', 'COIL': 'Coil', 'SQFT': 'Sqft', 'SET': 'Set',
    'CFT': 'Cft', 'CAN': 'Can', 'RFT': 'Rft', 'BUNDLE': 'Bundle', 'SQM': 'Sqm', 'CASE': 'Case',
    'ML': 'Ml', 'BOX': 'Box', 'PAIR': 'Pair', 'SHEET': 'Sheet', 'TON': 'Ton', 'LOT': 'Lot',
}

def clean(v):
    return ' '.join(str(v).split()) if v is not None else ''

report = collections.defaultdict(list)
rows = []
for path in sys.argv[1:]:
    wb = openpyxl.load_workbook(path, data_only=True)
    for ws in wb.worksheets:
        sheet = ws.title.strip().upper()
        if sheet not in CATEGORY:
            report['sheets skipped'].append(ws.title); continue
        category, prefix = CATEGORY[sheet]
        hdr = None
        for n, r in enumerate(ws.iter_rows(values_only=True), start=1):
            vals = [clean(c) for c in r]
            if 'PRODUCT NAME' in vals:
                hdr = {v: i for i, v in enumerate(vals) if v}; continue
            if sheet == 'SHEET1' and 'GST RATE (%)' in vals:
                hdr = SHEET1_COLS; continue
            if not hdr: continue
            get = lambda k: vals[hdr[k]] if k in hdr and hdr[k] < len(vals) else ''
            name = get('PRODUCT NAME')
            if not name: continue
            unit_raw = get('UNITS').upper().rstrip('.')
            unit = UNIT.get(unit_raw)
            if not unit:
                report['unit missing or unknown -> Nos'].append(f'{category} row {n}: {name} [{unit_raw or "blank"}]')
                unit = 'Nos'
            gst = get('GST RATE (%)')
            try: gst = round(float(gst) * 100, 2) if float(gst) <= 1 else round(float(gst), 2)
            except ValueError: gst = None
            rows.append(dict(
                code=get('PRODUCT CODE').upper(), name=name, brand=get('BRAND/MAKE'), unit=unit,
                packing=get('UNIT VOLUME'), spec=get('REMARKS'), gstRate=gst,
                hsn=re.sub(r'[^0-9A-Za-z]', '', get('HSN CODE (INDICATIVE)')), category=category,
                subCategory=get('CATEGORY (INDICATIVE)'), prefix=prefix, source=f'{ws.title.strip()} row {n}'))

total = len(rows)

# 1. exact repeats
seen, kept = set(), []
for r in rows:
    key = (r['name'].lower(), r['brand'].lower(), r['unit'], r['packing'].lower())
    if key in seen:
        report['exact repeats kept once'].append(f"{r['source']}: {r['name']} {r['brand']}"); continue
    seen.add(key); kept.append(r)
rows = kept

# 2. names: one name, one product
groups = collections.defaultdict(list)
for r in rows: groups[r['name'].lower()].append(r)
for same in groups.values():
    if len(same) == 1: continue
    for r in same:
        r['_n'] = r['name'] + (f" — {r['brand']}" if r['brand'] else '')
    for step in ('packing', 'unit'):
        c = collections.Counter(r['_n'].lower() for r in same)
        for r in same:
            if c[r['_n'].lower()] > 1 and r[step]:
                r['_n'] += f" ({r[step]})"
    c = collections.Counter(r['_n'].lower() for r in same); k = collections.Counter()
    for r in same:
        if c[r['_n'].lower()] > 1:
            k[r['_n'].lower()] += 1
            if k[r['_n'].lower()] > 1: r['_n'] += f" #{k[r['_n'].lower()]}"
    for r in same:
        if r['_n'] != r['name']:
            report['names made distinct'].append(f"{r['source']}: {r['name']} -> {r['_n']}")
        r['name'] = r.pop('_n')

# 3. codes: one code, one product
slug = lambda s: re.sub(r'[^A-Z0-9]+', '', s.upper())[:12]
used, gen = set(), collections.Counter()
for r in rows:
    if not r['code']:
        while True:
            gen[r['prefix']] += 1
            code = f"IND-{r['prefix']}-N{gen[r['prefix']]:04d}"
            if code not in used: break
        report['codes generated'].append(f"{r['source']}: {r['name']} -> {code}")
        r['code'] = code
    elif r['code'] in used:
        base, code, n = r['code'], r['code'] + (f"-{slug(r['brand'])}" if r['brand'] else ''), 1
        while code in used or code == base:
            n += 1; code = f"{base}-{n}"
        report['codes made distinct'].append(f"{r['source']}: {base} -> {code}")
        r['code'] = code
    used.add(r['code'])

out = [{k: r[k] for k in ('code', 'name', 'unit', 'category', 'subCategory', 'brand', 'packing',
                          'hsn', 'gstRate', 'spec')} for r in rows]
(HERE / 'products.json').write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding='utf8')

cats = collections.Counter(r['category'] for r in out)
subs = {(r['category'], r['subCategory']) for r in out}
lines = [f'Product rows read: {total}', f'Products after removing exact repeats: {len(out)}',
         f'Main categories: {len(cats)}  ' + ', '.join(f'{k} {v}' for k, v in cats.items()),
         f'Sub-categories: {len(subs)}',
         'Units: ' + ', '.join(f'{k} {v}' for k, v in collections.Counter(r['unit'] for r in out).most_common()),
         'GST: ' + ', '.join(f'{k}% {v}' for k, v in collections.Counter(r['gstRate'] for r in out).items()), '']
for title, items in report.items():
    lines += [f'== {title} ({len(items)})'] + [f'  {i}' for i in items] + ['']
(HERE / 'products-report.txt').write_text('\n'.join(lines), encoding='utf8')
print('\n'.join(lines[:7]))
for title, items in report.items(): print(f'{title}: {len(items)}')
