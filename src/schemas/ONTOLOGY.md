# Ammitto Sanctions Ontology

## Overview

The Ammitto ontology provides a standardized vocabulary for representing sanctions data from multiple international sources. It is designed to be:

- **MECE** (Mutually Exclusive, Collectively Exhaustive) - each concept defined once
- **Interoperable** - compatible with Schema.org and JSON-LD
- **Extensible** - open for new sources and entity types

## Namespace

The Ammitto ontology uses the following namespace:

```
https://www.ammitto.org/ontology/
```

## Core Entity Types

### EntityType Enumeration

All sanctioned entities fall into one of four types:

| Type | Description | JSON-LD @type |
|------|-------------|---------------|
| `person` | Individual human beings | `PersonEntity` |
| `organization` | Companies, foundations, government bodies | `OrganizationEntity` |
| `vessel` | Maritime vessels (ships, boats) | `VesselEntity` |
| `aircraft` | Aircraft (planes, helicopters) | `AircraftEntity` |

### Entity Hierarchy

```
Entity (abstract)
├── PersonEntity
│   ├── names: NameVariant[]
│   ├── birthInfo: BirthInfo[]
│   ├── addresses: Address[]
│   └── identifications: Identification[]
│
├── OrganizationEntity
│   ├── names: NameVariant[]
│   ├── addresses: Address[]
│   └── identifications: Identification[]
│
├── VesselEntity
│   ├── names: NameVariant[]
│   ├── imoNumber: string
│   ├── flagState: string
│   └── tonnage: integer
│
└── AircraftEntity
    ├── names: NameVariant[]
    ├── serialNumber: string
    └── registration: string
```

## Value Objects

### NameVariant

Represents a name with optional components.

```json
{
  "fullName": "IVAN IVANOVICH PETROV",
  "firstName": "IVAN",
  "middleName": "IVANOVICH",
  "lastName": "PETROV",
  "script": "Latn",
  "isPrimary": true
}
```

| Property | Type | Description |
|----------|------|-------------|
| `fullName` | string | Complete name |
| `firstName` | string | Given name |
| `middleName` | string | Middle name/patronymic |
| `lastName` | string | Family name |
| `script` | string | Script code (Latn, Cyrl, Arab, Hani) |
| `isPrimary` | boolean | Primary name variant |

### Address

Physical location information.

```json
{
  "street": "123 Main Street",
  "city": "Moscow",
  "state": "Moscow Oblast",
  "country": "Russia",
  "postalCode": "123456"
}
```

### BirthInfo

Birth date and location information.

```json
{
  "date": "1970-01-15",
  "circa": false,
  "city": "Moscow",
  "region": "Central Russia",
  "country": "Russia"
}
```

### Identification

Government-issued identification documents.

```json
{
  "type": "Passport",
  "number": "AB1234567",
  "issuingCountry": "Russia",
  "note": "Expires 2025"
}
```

Identification types include:
- `Passport`
- `NationalID`
- `TaxID`
- `DriverLicense`
- `IMO Number` (vessels)
- `Other`

## Sanction Classes

### SanctionEntry

Represents a sanction imposed on an entity.

```json
{
  "entityId": "eu-entity-001",
  "authority": "eu",
  "regime": "russia",
  "status": "active",
  "effects": ["asset_freeze", "travel_ban"],
  "period": {
    "listedDate": "2022-02-23",
    "effectiveDate": "2022-02-23"
  }
}
```

### SanctionEffect

Types of restrictive measures:

| Effect | Description |
|--------|-------------|
| `asset_freeze` | Freezing of assets and economic resources |
| `travel_ban` | Visa restrictions / entry bans |
| `arms_embargo` | Prohibition on arms trade |
| `trade_restriction` | Import/export restrictions |
| `financial_prohibition` | Banking and financial services restrictions |
| `debarment` | Exclusion from public contracts |

### SanctionStatus

Current status of a sanction:

| Status | Description |
|--------|-------------|
| `active` | Currently in effect |
| `suspended` | Temporarily not applied |
| `delisted` | Removed from sanctions list |
| `expired` | Sanction period ended |
| `terminated` | Formally ended |

## Source References

### SourceReference

Links an entity to its original source.

```json
{
  "sourceCode": "eu",
  "referenceNumber": "EU.10982.59"
}
```

### Available Sources

| Code | Name | Authority |
|------|------|-----------|
| `eu` | European Union | European Commission |
| `un` | United Nations | UN Security Council |
| `us` | United States | OFAC |
| `wb` | World Bank | World Bank Group |
| `uk` | United Kingdom | OFSI |
| `au` | Australia | DFAT |
| `ca` | Canada | Global Affairs Canada |
| `ch` | Switzerland | SECO |
| `cn` | China | MOFCOM |
| `ru` | Russia | Ministry of Foreign Affairs |

## JSON-LD Context

The full JSON-LD context is available at:

```
/schemas/context.jsonld
```

This context defines all property mappings and can be used to interpret Ammitto data as Linked Data.

## Example Entity

```json
{
  "@context": "/schemas/context.jsonld",
  "@id": "eu-entity-001",
  "@type": "PersonEntity",
  "entityType": "person",
  "names": [
    { "fullName": "IVAN IVANOVICH PETROV", "isPrimary": true },
    { "fullName": "ИВАН ИВАНОВИЧ ПЕТРОВ", "script": "Cyrl", "isPrimary": false }
  ],
  "sourceReferences": [
    { "sourceCode": "eu", "referenceNumber": "EU.123.45" }
  ],
  "birthInfo": [
    { "date": "1970-01-15", "country": "Russia" }
  ],
  "addresses": [
    { "city": "Moscow", "country": "Russia" }
  ],
  "remarks": "Subject to EU restrictive measures."
}
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/stats.json` | Global statistics |
| `GET /api/v1/sources/{source}.jsonld` | All entities from a source |

## Search Engine

Ammitto uses **FlexSearch** for client-side full-text search with the following configuration:

- **Tokenization**: Forward matching (prefix search)
- **Caching**: Enabled
- **Search Fields**: Name variants, country, reference numbers, remarks

## File Structure

```
public/
├── api/v1/
│   ├── stats.json           # Global statistics
│   └── sources/
│       ├── eu.jsonld        # EU entities
│       ├── un.jsonld        # UN entities
│       ├── us.jsonld        # US entities
│       └── wb.jsonld        # World Bank entities
└── schemas/
    └── context.jsonld       # JSON-LD context
```
