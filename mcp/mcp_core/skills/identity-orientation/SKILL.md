---
name: identity-orientation
description: Element identity, family info, door/window orientation — FamilyName, Matches, RoomFrom, Handing, HingeSide
---

# Identity & Orientation

Identify what an element is, match it by name, and for doors/windows, determine orientation and room relationships.

## Identity Helpers

```csharp
element.FamilyName()                       // "Basic Wall"
element.GetStr("Family and Type")          // full identity string
element.Matches("HCB")                     // fuzzy match: Type Name + Family Name
element.GetElementType()                   // returns the ElementType for any instance
id.ToElement(Doc)                          // resolve ElementId → Element
```

## Door & Window Orientation

Stable regardless of flips:

```csharp
FamilyInstance door = null;                // a door instance
Println(door.RoomFrom());                  // "LIVING ROOM"
Println(door.RoomTo());                    // "CORRIDOR"
Println(door.RoomAccess());                // alias for RoomFrom
Println(door.RoomDestination());           // alias for RoomTo
Println(door.Handing());                   // "LH" or "RH"
Println(door.HingeSide());                 // "Left" or "Right"
Println(door.IsHandFlipped());             // ⚠ a METHOD, not a property — true/false
Println(door.IsFacingFlipped());           // ⚠ a METHOD, not a property — true/false
Println(door.FindSwingArc());              // largest Arc in geometry (swing path)
```

⚠⚠ **These are READ-ONLY. You cannot SET handing.** Measured by reflection 2026-10-08:

```
FamilyInstance.HandFlipped    CanWrite = False
FamilyInstance.FacingFlipped  CanWrite = False
FamilyInstance.flipHand()     exists
FamilyInstance.flipFacing()   exists
```

`door.HandFlipped = true` is a **compile error**. Change handing with the **method**, inside a
`Transact`, then re-read the property to confirm:

```csharp
Transact("flip door hand", () => door.flipHand());
Println($"hand now flipped: {door.HandFlipped}");
```

⚠ **Handing is found by trying, not by deriving.** The `flip` argument of
`NewFamilyInstance` flips the *wall's* orientation, not the door's swing — so a door's hinge
side after placement is not predictable from the call you made. Place it, read
`HandFlipped` / `FacingFlipped`, flip if wrong, re-read. Two reads and at most one flip is the
cheapest reliable loop.

⚠ **Changing a placed door's TYPE can re-resolve its orientation.** After a symbol swap, re-read
both flags rather than assuming the handing you set survived.

## Standard Door Filter

```csharp
// Exclude curtain-wall-hosted glass doors
GetElements<FamilyInstance>("Doors").StandardDoor().Table()
// → 33 standard doors (out of 40 total)

door.IsStandardDoor()                      // true if NOT hosted on a Curtain Wall
```

## Native Identity Properties (dot access)

```
el.Id          → ElementId (use .IntegerValue for int)
el.Name        → string (type name on instances, element name otherwise)
el.Symbol      → ElementId of the family symbol
```

## Typed vs String Retrieval

Some categories have C# classes (`.Name`, `.Area` are dot-access properties). Others are loadable families — must use `.GetStr()` for everything.

**Typed (use `<T>()`):** Wall, Floor, Room, Ceiling, Level, Roof, Stairs, View, ViewSheet, Grid

**String (use `("Category")`):** Doors, Windows, Furniture, Structural Columns, Structural Framing, Generic Models
