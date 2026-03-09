# Available Phase Space Diagnostics in dHybridR

Source: `specdiag.f90`, line 69. Total: 22 phase spaces (`PHNUMBER = 22`).

## Charge Density (spatial histogram)
| Name     | Description                    | Min DIM | Notes |
|----------|--------------------------------|---------|-------|
| x3x2x1  | Charge density on grid (1D/2D/3D depending on DIM) | 0 (always) | Deposits particle positions onto the simulation grid via OutputSpecies3D; dimensionality matches DIM, not always 3D despite the name |

## 2D Position-Position
| Name | Description      | Min DIM |
|------|------------------|---------|
| x2x1 | x2 vs x1        | 2       |
| x3x1 | x3 vs x1        | 3       |
| x3x2 | x3 vs x2        | 3       |

## 2D Momentum-Momentum
| Name | Description      | Min DIM |
|------|------------------|---------|
| p2p1 | p2 vs p1         | 0 (always) |
| p3p1 | p3 vs p1         | 0 (always) |
| p3p2 | p3 vs p2         | 0 (always) |

## 2D Mixed Position-Momentum
| Name | Description      | Min DIM |
|------|------------------|---------|
| p1x1 | p1 vs x1         | 1 (always) |
| p2x2 | p2 vs x2         | 2       |
| p3x3 | p3 vs x3         | 3       |
| p1x2 | p1 vs x2         | 2       |
| p1x3 | p1 vs x3         | 3       |
| p2x1 | p2 vs x1         | 1 (always) |
| p2x3 | p2 vs x3         | 3       |
| p3x1 | p3 vs x1         | 1 (always) |
| p3x2 | p3 vs x2         | 2       |

## 2D Total-Momentum vs Position
| Name | Description      | Min DIM |
|------|------------------|---------|
| ptx1 | |p| vs x1        | 1 (always) |
| ptx2 | |p| vs x2        | 2       |
| ptx3 | |p| vs x3        | 3       |

## 2D Energy vs Position
| Name | Description      | Min DIM |
|------|------------------|---------|
| etx1 | E_total vs x1    | 1 (always) |
| etx2 | E_total vs x2    | 2       |
| etx3 | E_total vs x3    | 3       |

## Dimension Rules

From `specdiag.f90` line 1836:
```fortran
if ((ptype(1) == SPACETP .and. dir(1) > DIM) .or. (ptype(2) == SPACETP .and. dir(2) > DIM)) then
    ! ERROR: invalid for this DIM
```

- Momentum dimensions (p1, p2, p3, pt, et) are ALWAYS available (VDIM=3 always)
- Space dimensions: x1 always, x2 needs DIM≥2, x3 needs DIM≥3
- Exception: x3x2x1 is always available (separate 3D output routine)
