import collections
import concurrent.futures
import json
import re
import unicodedata

import bs4
import requests

DIRECTORY = "https://facens.br/cursos/graduacao/"
ADMISSIONS = (
    "https://facens.br/wp-content/uploads/2026/09/"
    "Edital-05_Concurso_Agendado_e_Enem_2027S1.pdf"
)
from datetime import date
CHECKED = date.today().isoformat()

NAMES = {
    "odontologia": "Odontologia",
    "biomedicina": "Biomedicina",
    "psicologia": "Psicologia",
    "enfermagem": "Enfermagem",
    "medicina-veterinaria": "Medicina Veterinária",
    "engenharia-civil": "Engenharia Civil",
    "engenharia-de-computacao": "Engenharia da Computação",
    "engenharia-eletrica": "Engenharia Elétrica",
    "engenharia-mecanica": "Engenharia Mecânica",
    "engenharia-mecatronica": "Engenharia Mecatrônica",
    "engenharia-de-producao": "Engenharia de Produção",
    "engenharia-quimica": "Engenharia Química",
    "engenharia-agronomica": "Engenharia Agronômica",
    "engenharia-de-controle-e-automacao":
        "Engenharia de Controle e Automação",
    "arquitetura-e-urbanismo": "Arquitetura e Urbanismo",
    "tecnologia-em-analise-e-desenvolvimento-de-sistemas":
        "Tecnologia em Análise e Desenvolvimento de Sistemas",
    "tecnologia-em-automacao-industrial":
        "Tecnologia em Automação Industrial",
    "tecnologia-em-logistica": "Tecnologia em Logística",
    "tecnologia-em-jogos-digitais": "Tecnologia em Jogos Digitais",
    "tecnologia-em-gestao-de-t-i": "Tecnologia em Gestão de T.I.",
    "medicina": "Medicina",
}


def norm(element):
    return unicodedata.normalize(
        "NFC",
        re.sub(r"\s+", " ", element.get_text(" ", strip=True)),
    ).strip()


def fetch(url):
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    assert requests.utils.urlparse(response.url).hostname == "facens.br"
    return bs4.BeautifulSoup(response.content, "html.parser")


directory = fetch(DIRECTORY)
urls = list(dict.fromkeys(
    a["href"]
    for a in directory.select("a[href]")
    if a["href"].startswith(DIRECTORY) and a["href"] != DIRECTORY
))

assert len(urls) == 21
assert {url.split("/")[-2] for url in urls} == set(NAMES)


def extract(url):
    soup = fetch(url)
    main = soup.select_one("#main-content")
    assert main is not None

    page_text = norm(main)
    course_slug = url.split("/")[-2]

    degree = re.search(
        r"Formação (Bacharelado|Tecnólogo)", page_text
    ).group(1)
    duration = int(re.search(
        r"Duração (\d+) Semestres", page_text
    ).group(1))

    modalities = ["Presencial"]
    if course_slug == (
        "tecnologia-em-analise-e-desenvolvimento-de-sistemas"
    ):
        modalities = ["Presencial", "Semipresencial", "EAD"]
    elif course_slug == "tecnologia-em-gestao-de-t-i":
        modalities = ["Presencial", "Semipresencial"]

    blocks = {}

    for container in soup.select(".dsm-advanced-tabs-container"):
        preceding_heading = norm(container.find_previous(
            ["h1", "h2", "h3", "h4"]
        ))
        modality = (
            preceding_heading
            if preceding_heading in modalities
            else modalities[0]
        )
        assert modality not in blocks

        controls = container.select(
            ".dsm-advanced-tabs-wrapper .dsm-tab"
        )
        contents = container.select(
            ".dsm-advanced-tabs-content-wrapper > .dsm-content-wrapper"
        )
        assert len(controls) == len(contents)

        subjects = []
        anomalies = []
        seen = set()
        semesters = []

        for control, content in zip(controls, contents):
            semester = int(re.match(
                r"(\d+)", norm(control)
            ).group(1))
            semesters.append(semester)

            for cell in content.select(".dsm-content td"):
                name = norm(cell)

                if not name or name == "-":
                    anomalies.append({
                        "semester": semester,
                        "type": "unnamed_published_row",
                        "original_value": name,
                    })
                    continue

                key = (name, semester)
                if key in seen:
                    anomalies.append({
                        "semester": semester,
                        "type": "duplicate_published_row",
                        "original_value": name,
                    })
                    continue

                seen.add(key)
                subjects.append({
                    "name": name,
                    "semester": semester,
                })

        assert semesters == list(range(1, duration + 1)), (
            course_slug, modality, semesters, duration
        )

        blocks[modality] = (
            subjects,
            anomalies,
            container.sourceline,
            contents[-1].sourceline,
        )

    # Medicine uses columns of text modules, not the tab/table component.
    if course_slug == "medicina":
        subjects = []
        semesters = []
        source_lines = []

        for column in main.select(".et_pb_column"):
            elements = column.select(".et_pb_text_inner")
            first = norm(elements[0]) if elements else ""
            match = re.fullmatch(r"(\d+)º Semestre", first)

            if not match:
                continue

            semester = int(match.group(1))
            semesters.append(semester)
            source_lines.append(column.sourceline)

            for element in elements[1:]:
                name = norm(element)
                if name:
                    subjects.append({
                        "name": name,
                        "semester": semester,
                    })

        assert semesters == list(range(1, 13))
        blocks["Presencial"] = (
            subjects,
            [],
            min(source_lines),
            max(source_lines),
        )

    records = []

    for modality in modalities:
        intake_listed = course_slug not in {
            "medicina",
            "tecnologia-em-jogos-digitais",
            "tecnologia-em-gestao-de-t-i",
        }

        record = {
            "slug": f"{course_slug}-{modality.lower()}",
            "course_slug": course_slug,
            "official_name": NAMES[course_slug],
            "modality": modality,
            "degree": degree,
            "duration_semesters": duration,
            "source_url": url,
            "curriculum_source_url":
                url if modality in blocks else None,
            "curriculum_version": None,
            "subjects": [],
            "curriculum_status": "unavailable",
            "checked_date": CHECKED,
            "notes": [],
            "source_anomalies": [],
            "admissions_2027s1_status": (
                "listed" if intake_listed
                else "not_listed_in_general_notice"
            ),
        }

        if modality in blocks:
            subjects, anomalies, first_line, last_start_line = (
                blocks[modality]
            )
            record.update({
                "subjects": subjects,
                "source_anomalies": anomalies,
                "curriculum_status":
                    "partial" if anomalies else "complete",
                # These are component start lines, not full line ranges.
                "curriculum_html_start_lines":
                    [first_line, last_start_line],
            })

            if anomalies:
                record["notes"].append(
                    "Todos os semestres publicados foram extraídos, "
                    "mas há células vazias/hífen ou duplicatas na fonte. "
                    "Nenhuma disciplina foi inferida para substituir "
                    "essas linhas; duplicatas exatas no mesmo semestre "
                    "foram removidas."
                )
        elif course_slug == "tecnologia-em-gestao-de-t-i":
            record["notes"].append(
                "Página anuncia Presencial / SemiPresencial, mas "
                "identifica a única grade publicada como Semipresencial; "
                "essa grade NÃO foi atribuída à modalidade presencial."
            )
        else:
            record["notes"].append(
                "A página oficial não publica disciplinas nem link "
                "de matriz curricular para esta modalidade."
            )

        if course_slug == "medicina":
            record["notes"].extend([
                "A página contém comunicado de adiamento do vestibular "
                "de 23/11/2024 e documentos judiciais; presença no "
                "diretório não comprova ingresso/turma atual.",
                "Preservada a disciplina Atenção Integral à Saúde V: "
                "Planejamento em saúde tanto no 5º como no 6º semestre, "
                "exatamente como publicada.",
            ])

        if not intake_listed:
            record["notes"].append(
                "Curso consta do diretório oficial atual, mas não da "
                "tabela geral de vagas do Edital 05/2026 para 2027S1, "
                "pp. 3–6; não inferir encerramento nem oferta de "
                "ingresso atual."
            )

        records.append(record)

    return records


with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
    courses = [
        course
        for records in executor.map(extract, urls)
        for course in records
    ]

assert len(courses) == 24
counts = collections.Counter(
    course["curriculum_status"] for course in courses
)

coverage = {
    "directory_courses": 21,
    "course_modality_records": 24,
    "records_with_published_subjects": sum(
        bool(course["subjects"]) for course in courses
    ),
    "complete": counts["complete"],
    "partial": counts["partial"],
    "unavailable": counts["unavailable"],
    "subject_records": sum(
        len(course["subjects"]) for course in courses
    ),
    "distinct_subject_names": len({
        subject["name"]
        for course in courses
        for subject in course["subjects"]
    }),
}

assert coverage == {
    "directory_courses": 21,
    "course_modality_records": 24,
    "records_with_published_subjects": 22,
    "complete": 18,
    "partial": 4,
    "unavailable": 2,
    "subject_records": 1087,
    "distinct_subject_names": 718,
}, "Official publication changed; review rather than silently importing."

dataset = {
    "institution_name": "Centro Universitário Facens (UniFacens)",
    "institution_slug": "facens",
    "checked_date": CHECKED,
    "source_url": DIRECTORY,
    "scope": (
        "Graduação: bacharelados e tecnólogos; exclui "
        "pós-graduação, extensão e residência."
    ),
    "admissions_source_url": ADMISSIONS,
    "admissions_source_pages": [3, 4, 5, 6],
    "notes": [
        "21 cursos do diretório, representados por 24 combinações "
        "curso/modalidade. Engenharia Agronômica aparece duas vezes "
        "no diretório e foi consolidada.",

        "As matrizes foram extraídas das próprias páginas oficiais, "
        "em HTML. Nenhum link para PDF de matriz curricular foi "
        "encontrado nessas páginas ou no hub público de documentos. "
        "O PDF do edital de ingresso é digitalizado, lido por OCR "
        "apenas para corroborar a oferta; não é fonte de disciplinas.",

        "Nenhuma página informa ano/versão da matriz: "
        "curriculum_version é null. Preços com ano 2026 e datas "
        "de atualização não foram convertidos em versão curricular.",

        "complete significa todos os semestres e nomes não vazios "
        "publicados extraídos; não certifica matriz integral aplicável "
        "a toda coorte. partial indica anomalias da própria publicação; "
        "unavailable indica ausência de matriz específica da modalidade.",

        "Mantidas grafia e capitalização da fonte, inclusive erros "
        "aparentes. Normalizadas apenas entidades HTML, Unicode e "
        "espaços. Não preencher optativas/eletivas genéricas com "
        "nomes inventados.",

        "18 cursos/20 modalidades constam do edital geral 2027S1. "
        "Gestão de T.I., Jogos Digitais e Medicina permanecem no "
        "catálogo por estarem no diretório, com oferta de ingresso "
        "atual não confirmada.",
    ],
    "coverage": coverage,
    "courses": courses,
}

contract = {
    "institution": dataset["institution_name"],
    "checked_at": dataset["checked_date"],
    "source_url": dataset["source_url"],
    "courses": [{
        "id": c["slug"], "name": c["official_name"],
        "degree": c["degree"], "modality": c["modality"],
        "source_url": c["source_url"],
        "curriculum_source_url": c["curriculum_source_url"],
        "curriculum_version": c["curriculum_version"],
        "curriculum_status": c["curriculum_status"], "subjects": c["subjects"]
    } for c in courses]
}
import argparse
from pathlib import Path
parser = argparse.ArgumentParser(description="Recollect the reviewed FACENS public catalog; stops if coverage changes.")
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--audit", type=Path)
args = parser.parse_args()
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(contract, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if args.audit:
    args.audit.parent.mkdir(parents=True, exist_ok=True)
    args.audit.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(coverage, ensure_ascii=False))
