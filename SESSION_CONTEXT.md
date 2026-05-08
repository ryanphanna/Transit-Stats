# Transit Stats - Session Context & Field Deductions

## Pending Trip Updates (Category B/C)
The following trips are ready for verification once confirmed.

| Trip ID | Route | Original Start | Original End | Corrected Start | Corrected End | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `g95326iVI3cyLeL3jnWS` | 510 NB | Queens Quay Station | Spadina Ave at Nassau St | Queens Quay | Spadina Ave at Nassau St | Applied |
| `VNK8tXR5L7jTqeMIGCgZ` | 65 NB | Parliament / King / 6639 | Castle Frank Station | Parliament St at King St East | Castle Frank Station | Pending Confirmation |

## Canonical Mappings
| Input Name | Canonical Library Name | Stop ID |
| :--- | :--- | :--- |
| Queens Quay Station | Queens Quay | `NhblmfvmXRM35rvrnpqh` |
| Spadina Ave at Nassau St | Spadina Ave at Nassau St | `IFQuNykSeOUemrQQf7oZ` |
| Spadina Ave at Nassau St South Side | Spadina Ave at Nassau St South Side | `AMjNG22bU85uCTahzmYy` |
| King / Spadina / 15648 | King St West at Spadina Ave | `fC4PxRiDRAoFQ81WZL5c` |

## ML Requirements
- Trips MUST have `verified: true` to be included in training.
- Stations (e.g., Dufferin Station) should NOT have stop codes.
- Individual stops (e.g., Dufferin at Dundas) MUST have stop codes (e.g., 2043).
