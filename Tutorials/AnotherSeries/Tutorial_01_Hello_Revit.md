# Tutorial 1: "Hello Revit" (The Feedback Loop)

Welcome to the first step of your Revit automation journey! In this tutorial, we aren't going to change the model yet. Instead, we are going to learn how to **talk** to Revit and how to make Revit **talk back** to us. 

This is what developers call the "Feedback Loop."

---

## 🎯 The Goal
Write a script that identifies who you are, what project you are in, and which view you are looking at.

## 🛠️ The Paracore Global: `Println()`
In Paracore, `Println()` is your best friend. It stands for "Print Line." Whatever you put inside the parentheses will show up in the **Console** tab of the Paracore UI.

---

## 💻 The Code

Copy this into a new script in Paracore:

```csharp
// 1. A simple message
Println("Welcome to Paracore Automation!");

// 2. Accessing your computer username
string user = UIApp.Application.Username;
Println($"Hello, {user}!");

// 3. Accessing the Project Name
string projectTitle = Doc.Title;
Println($"Project: {projectTitle}");

// 4. Accessing the Active View
string viewName = Doc.ActiveView.Name;
Println($"Current View: {viewName}");
```

---

## 🔍 How it Works (The Breakdown)

### 1. The `$` Sign (String Interpolation)
Notice the `$` before the quotes in `$"Hello, {user}!"`? This is a C# magic trick called **Interpolation**. It allows you to "inject" a variable (like `user`) directly into a sentence using curly braces `{}`.

### 2. The `Doc` Global
`Doc` represents the **Active Document** (your Revit file). It contains everything: walls, floors, levels, and views. When we write `Doc.Title`, we are asking the file for its name.

### 3. The `UIApp` Global
`UIApp` represents the **Revit User Interface**. This is where we find information about the person using the software, like `UIApp.Application.Username`.

---

## 🚀 Step-by-Step Instructions

1.  **Open Revit** and open any project (the Sample Project is fine).
2.  **Open Paracore** and ensure the status bar says "Connected."
3.  Click **"New Script"** and name it `01_HelloRevit.cs`.
4.  Paste the code above into the editor.
5.  Click the **Run** button.
6.  Switch to the **Console** tab in the Inspector (the right panel) to see your results!

---

## 🌟 Practice Challenge
Try to modify the script to print today's date! 
*Hint: Use `DateTime.Now.ToShortDateString()` inside a `Println()`.*

---

### What's Next?
In the next tutorial, we will move from reading "Project Data" to reading "Selected Elements." We'll find out exactly what you clicked on in Revit!
