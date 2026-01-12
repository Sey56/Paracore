# Tutorial 2: "What did I select?"

In the previous tutorial, we looked at the project as a whole. Today, we are going to get specific. We'll learn how to write a script that "sees" what you have selected in the Revit window.

This is the basis for almost every "Batch" automation tool.

---

## 🎯 The Goal
Select an object in Revit (a wall, a window, a desk) and have Paracore tell you its Name, Category, and unique Element ID.

## 🛠️ The Paracore Global: `UIDoc`
While `Doc` handles the data *inside* the file, `UIDoc` represents the **User Interface**. We use it to interact with the user's current selection.

---

## 💻 The Code

Copy this into a new script named `02_Selection.cs`:

```csharp
// 1. Get the list of selected IDs from Revit
var selection = UIDoc.Selection.GetElementIds();

// 2. Safety Check: Did the user actually select anything?
if (selection.Count == 0)
{
    Println("⚠️ Please select an element in Revit first!");
    return; // This stops the script early
}

// 3. Grab the first ID from the selection list
var firstId = selection.First();

// 4. Turn that ID into a real Revit "Element"
Element element = Doc.GetElement(firstId);

// 5. Report the findings to the Console
Println("--- Selection Info ---");
Println($"Name: {element.Name}");
Println($"Category: {element.Category.Name}");
Println($"Element ID: {element.Id.Value}");
```

---

## 🔍 How it Works (The Breakdown)

### 1. `GetElementIds()`
Revit returns a list of "Element IDs" rather than the objects themselves. Think of an ID like a library catalog number. It's a unique number that identifies exactly one item in the model.

### 2. `Doc.GetElement(id)`
To get the actual data (like the name or category), we have to take that "catalog number" (ID) and ask the `Doc` to find the actual "Book" (Element).

### 3. `.Value` (Revit 2025+)
In newer versions of Revit, an Element ID is a `long` number. We access that number by writing `.Id.Value`.

---

## 🚀 Step-by-Step Instructions

1.  Go into Revit and click on any element (e.g., a Wall).
2.  Run the script in Paracore.
3.  Check the **Console**. It should display the details of that specific wall.
4.  Try selecting **nothing** and running it. Notice the custom warning message we wrote!

---

## 🌟 Practice Challenge
Can you change the script to print the **Level** the element is on?
*Hint: Use `element.LevelId` to get the ID, then use `Doc.GetElement()` again to find the Level name.*

---

### What's Next?
One element is cool, but automation is about **many** elements. In the next tutorial, we'll learn about **Loops**—how to process 100 walls as easily as 1.
