using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;
using SH_Tools.Commands;
using SH_Tools.Factories;
using SH_Tools.Handlers;
using SH_Tools.Models;
using SH_Tools.Services;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Windows.Input;
#nullable disable

namespace SH_Tools.ViewModels
{
    public sealed class CadViewModel : INotifyPropertyChanged
    {
        // Error log file name for PickLinkInstance
        private readonly string filePath = Path.Combine(SH_ToolsApp.HomePath, "PickLinkInstance.txt");
        // Error log file name for CreateElementsInRevit
        private readonly string filePath2 = Path.Combine(SH_ToolsApp.HomePath, "PickLinkInstance.txt");
        // If the link instance is picked or not
        private bool _isLinkInstancePicked;
        public bool IsLinkInstancePicked
        {
            get { return _isLinkInstancePicked; }
            set
            {
                _isLinkInstancePicked = value;
                OnPropertyChanged(nameof(IsLinkInstancePicked));
            }
        }

        // File path of the link instance
        private string _filePath;
        public string FilePath
        {
            get { return _filePath; }
            set
            {
                _filePath = value;
                OnPropertyChanged(nameof(FilePath));
            }
        }

        private List<string> _categoryNames;
        public List<string> CategoryNames
        {
            get { return _categoryNames; }
            set
            {
                _categoryNames = value;
                OnPropertyChanged(nameof(CategoryNames));
            }
        }

        private string _selectedCategory;
        public string SelectedCategory
        {
            get => _selectedCategory;
            set
            {
                _selectedCategory = value;
                OnPropertyChanged(nameof(SelectedCategory));
            }
        }

        private string _selectedElement;
        public string SelectedElement
        {
            get => _selectedElement;
            set
            {
                _selectedElement = value;
                OnPropertyChanged(nameof(SelectedCategory));
            }
        }

        public CadModel CadModel { get; set; }
        public ModelFactory ModelFactory { get; set; }
        public ViewModelFactory ViewModelFactory { get; set; }

        private ObservableCollection<Layer> _layers;
        public ObservableCollection<Layer> Layers
        {
            get => _layers;
            set
            {
                _layers = value;
                OnPropertyChanged(nameof(Layers));
            }
        }

        private ObservableCollection<Element> _levelElements;
        public ObservableCollection<Element> LevelElements
        {
            get => _levelElements;
            set
            {
                _levelElements = value;
                OnPropertyChanged(nameof(LevelElements));
            }
        }

        private ObservableCollection<Element> _wallElements;
        public ObservableCollection<Element> WallElements
        {
            get => _wallElements;
            set
            {
                _wallElements = value;
                OnPropertyChanged(nameof(WallElements));
            }
        }

        private ObservableCollection<Element> _doorElements;
        public ObservableCollection<Element> DoorElements
        {
            get => _doorElements;
            set
            {
                _doorElements = value;
                OnPropertyChanged(nameof(DoorElements));
            }
        }

        private ObservableCollection<Element> _windowElements;
        public ObservableCollection<Element> WindowElements
        {
            get => _windowElements;
            set
            {
                _windowElements = value;
                OnPropertyChanged(nameof(WindowElements));
            }
        }
        private double _sillHeight;
        public double SillHeight
        {
            get => _sillHeight;
            set
            {
                _sillHeight = value < 0 ? 0 : value;
                OnPropertyChanged(nameof(SillHeight));
            }
        }

        public void OnUserEnteredSillHeight(Layer layer)
        {
            // Update the SillHeight property of the current Layer object
            // You'll need to determine how to get the current Layer object

            if (layer != null)
            {
                layer.SillHeight = SillHeight;
            }
        }

        private ObservableCollection<Element> _columnElements;
        public ObservableCollection<Element> ColumnElements
        {
            get => _columnElements;
            set
            {
                _columnElements = value;
                OnPropertyChanged(nameof(ColumnElements));
            }
        }

        private ObservableCollection<Element> _beamElements;
        public ObservableCollection<Element> BeamElements
        {
            get => _beamElements;
            set
            {
                _beamElements = value;
                OnPropertyChanged(nameof(BeamElements));
            }
        }

        private ObservableCollection<string> _cadLayerNames;
        public ObservableCollection<string> CadLayerNames
        {
            get => _cadLayerNames;
            set
            {
                _cadLayerNames = value;
                OnPropertyChanged(nameof(CadLayerNames));
            }
        }
        public Dictionary<string, List<string>> CadLayerNamesByCategory { get; set; }

        private ObservableCollection<Color> _layerColors;
        public ObservableCollection<Color> LayerColors
        {
            get => _layerColors;
            set
            {
                _layerColors = value;
                OnPropertyChanged(nameof(LayerColors));
            }
        }

        private Level _selectedBaseLevel;
        public Level SelectedBaseLevel
        {
            get => _selectedBaseLevel;
            set
            {
                _selectedBaseLevel = value;
                // Clear the AllCreatedWalls list
                //SharedData.AllCreatedWalls.Clear();
                OnPropertyChanged(nameof(SelectedBaseLevel));
            }
        }

        private string _statusBarMessage;
        public string StatusBarMessage
        {
            get { return _statusBarMessage; }
            set
            {
                if (_statusBarMessage != value)
                {
                    _statusBarMessage = value;
                    OnPropertyChanged(nameof(StatusBarMessage));
                }
            }
        }

        public UIApplication UIApp { get; set; }
        // This is the command that will be bound to your "Select File" button
        public ICommand PickLinkInstanceCommand { get; }
        public ICommand AddLayerCommand { get; }
        public ICommand DeleteLayerCommand { get; }

        public ICommand CreateRevitElementsCommand { get; }
        public ICommand ResetTypesCommand { get; }
        public ICommand TextChangedCommand { get; }
        public ICommand LostFocusCommand { get; }
        public ICommand SillHeightSetCommand { get; }

        // Create External Event Handlers
        private readonly ExternalEvent _createRevitElementsEvent; // Change the type to ExternalEvent
        private readonly Dictionary<string, (BaseLayerModel, BaseLayerViewModel)> layerModelsAndViewModels
            = [];

        public string CreationMessage { get; set; }
        public CadViewModel(UIApplication uiApp)
        {
            UIApp = uiApp;
            // Update Elements
            ServiceFacade serviceFacade = new(uiApp);
            LevelElements = serviceFacade.LevelService.Elements;
            WallElements = serviceFacade.WallTypeService.Elements;
            DoorElements = serviceFacade.DoorTypeService.Elements;
            WindowElements = serviceFacade.WindowTypeService.Elements;
            ColumnElements = serviceFacade.ColumnTypeService.Elements;
            BeamElements = serviceFacade.BeamTypeService.Elements;

            // Initialize the commands (these have transactions so need externalevent handler)
            PickLinkInstanceCommand = new RelayCommand(PickLinkInstance, CanPickLinkInstance);
            AddLayerCommand = new RelayCommand(AddLayer, CanAddLayer);
            DeleteLayerCommand = new RelayCommand(DeleteLayer);
            TextChangedCommand = new RelayCommand(TextChanged);
            LostFocusCommand = new RelayCommand(LostFocus);
            SillHeightSetCommand = new RelayCommand(OnUserChangedSillHeight);

            CreateRevitElementsCommand = new RelayCommand(CreateRevitElements, CanCreateRevitElements);

            CadLayerNamesByCategory = [];
            // Initialize the CategoryNames
            CategoryNames = [];
            // Initialize Layers
            Layers = [];

            // Initialize the CadLayerNames 
            CadLayerNames = [];

            // Intialize the MappedAddinAndUserLayers
            // Initialize link cad file external event
            _createRevitElementsEvent = ExternalEvent.Create(new CreateRevitElementsExternalEvent(this));

            CreationMessage = string.Empty;
        }

        private void OnUserChangedSillHeight(object parameter)
        {
            // Check if the SelectedCategory is Windows and all necessary properties have been set
            if (parameter is Layer layer &&
                layer.SelectedCategory == "Windows" &&
                layer.SelectedBaseLevel != null &&
                layer.LayerName != null &&
                layer.SelectedElementType != null)
            {
                // I need to declare viewmodel here
                BaseLayerViewModel viewModel;
                // All necessary properties have been set, so create the Model and ViewModel
                BaseLayerModel model = ModelFactory.CreateModel(layer.LayerName, CadModel);

                // Check if the model is a WindowLayerModel
                if (model is WindowLayerModel windowModel)
                {
                    // If it is, set the SillHeight
                    windowModel.SillHeight = layer.SillHeight;
                }
                // If model is not null create viewmodel;
                if (model != null)
                {
                    viewModel = ViewModelFactory.CreateViewModel(layer.LayerName, model, CadModel);
                    if (viewModel != null)
                    {
                        layerModelsAndViewModels[layer.LayerName] = (model, viewModel);
                    }
                }
            }
        }

        private bool _textHasChanged;
        private void TextChanged(object obj)
        {
            _textHasChanged = true;
            // This method will be executed when the TextChangedCommand is invoked
            // You can put any code you want here
        }

        private void LostFocus(object obj)
        {
            if (_textHasChanged)
            {
                // Execute your method here
                OnUserChangedSillHeight(obj);

                _textHasChanged = false;
            }
            // This method will be executed when the LostFocusCommand is invoked
            // You can put any code you want here
        }

        private void DeleteLayer(object obj)
        {
            if (obj is Layer layer)
            {
                // Remove the layer
                Layers.Remove(layer);

                // Remove the message from the dictionary
                layerMessages.Remove(layer);

                // Rebuild the StatusBarMessage
                StatusBarMessage = string.Empty;
                foreach (var pair in layerMessages)
                {
                    StatusBarMessage += $"{pair.Key.LayerName}: {pair.Value}" + Environment.NewLine;
                }
            }
        }

        private bool CanAddLayer(object obj)
        {
            return true;
        }

        private bool _isCommandRunning = false;

        public bool IsCommandRunning
        {
            get { return _isCommandRunning; }
            set
            {
                _isCommandRunning = value;
                OnPropertyChanged(nameof(IsCommandRunning));
            }
        }

        private bool CanPickLinkInstance(object obj)
        {
            // The command can be executed if it's not already running
            return !IsCommandRunning;
        }


        private void PickLinkInstance(object obj)
        {
            IsCommandRunning = true; // The command is now running

            try
            {
                // Let the user pick an ImportInstance
                ImportInstance pickedInstance = GetUserSelectedImportInstance(UIApp.ActiveUIDocument);

                // If the user didn't pick an ImportInstance, return
                if (pickedInstance == null) return;

                // Update the IsLinkInstancePicked and FilePath properties
                IsLinkInstancePicked = true;
                FilePath = pickedInstance.Category.Name; // This is the file name

                // Create a new CadModel with the picked ImportInstance
                CadModel = new CadModel(UIApp, pickedInstance);

                // Initialize the CadLayerNamesByCategory property from the CadModel
                CadLayerNamesByCategory = CadModel.CadLayerNamesByCategory;
                CategoryNames = CadModel.CategoryNames;

                // Create Model and ViewModel factories
                ModelFactory = new ModelFactory();
                ViewModelFactory = new ViewModelFactory(this);
            }
            catch (Autodesk.Revit.Exceptions.OperationCanceledException)
            {
                // The user cancelled the pick operation. Handle this case as needed.
            }
            catch (Exception ex)
            {
                System.IO.File.WriteAllText(filePath, ex.ToString());
                TaskDialog.Show("Error", "An error occurred. Please check the picklinkinstance file in your home directory for details.");
            }
            finally
            {
                IsCommandRunning = false; // The command has finished running
            }
        }



        public class ImportInstanceSelectionFilter : ISelectionFilter
        {
            public bool AllowElement(Element elem)
            {
                // Only allow elements that are ImportInstances
                return elem is ImportInstance;
            }

            public bool AllowReference(Reference reference, XYZ position)
            {
                // Allow all references, we're only filtering elements
                return true;
            }
        }

        public static ImportInstance GetUserSelectedImportInstance(UIDocument uiDoc)
        {
            // Create an instance of our custom selection filter
            ISelectionFilter filter = new ImportInstanceSelectionFilter();

            // Prompt the user to pick an object in the scene, using our custom filter
            Reference pickedRef = uiDoc.Selection.PickObject(ObjectType.Element, filter, "Please select an ImportInstance.");

            // Retrieve the element from the picked reference
            Element pickedElement = uiDoc.Document.GetElement(pickedRef);

            // The picked element is guaranteed to be an ImportInstance due to our filter
            return (ImportInstance)pickedElement;
        }
        private void CreateRevitElements(object parameter)
        {
            _createRevitElementsEvent.Raise();
            // Refresh the active view to show the new walls
            UIApp.ActiveUIDocument.RefreshActiveView();
        }

        private bool CanCreateRevitElements(object parameter)
        {
            // Check if there is a fully setup layer in the Layers collection
            return Layers.Any(layer =>
            layer.SelectedBaseLevel != null &&
            layer.SelectedCategory != null &&
            layer.LayerName != null &&
            layer.SelectedElementType != null);
        }

        private void AddLayer(object parameter)
        {
            // Create a new Layer
            Layer newLayer = new(this)
            {
                SelectedBaseLevel = SelectedBaseLevel,
                CadLayerNames = CadLayerNames,
                LevelElements = LevelElements,
                CategoryNames = CategoryNames,
                ElementTypes = [],
                // ... set other properties as needed ...
            };

            // Add the new Layer to the Layers collection
            Layers.Add(newLayer);
        }

        public void OnUserSelectedElementType(Layer layer)
        {
            // Check if all necessary properties have been set
            if (layer.SelectedBaseLevel != null && layer.SelectedCategory != null && layer.LayerName != null && layer.SelectedElementType != null)
            {
                // All necessary properties have been set, so create the Model and ViewModel
                BaseLayerModel model = ModelFactory.CreateModel(layer.LayerName, CadModel);
                BaseLayerViewModel viewModel = ViewModelFactory.CreateViewModel(layer.LayerName, model, CadModel);
                layerModelsAndViewModels[layer.LayerName] = (model, viewModel);

                // If this is the first time this method is run, set IsFirstLayerReady to true
                if (!_isFirstLayerReady)
                {
                    IsFirstLayerReady = true;
                }
            }
        }

        // The first time the above method is run (i.e. when the first layer is
        // created and its SelectedElementType property is set show the 
        // "Create Revit Elements" button
        private bool _isFirstLayerReady;
        public bool IsFirstLayerReady
        {
            get { return _isFirstLayerReady; }
            set
            {
                if (_isFirstLayerReady != value)
                {
                    _isFirstLayerReady = value;
                    OnPropertyChanged(nameof(IsFirstLayerReady));
                }
            }
        }

        public void OnUserSelectedCategory(Layer layer, string categoryName)
        {
            // Set the SelectedCategory property of the layer
            layer.SelectedCategory = categoryName;

            // Update the ElementTypes property based on the selected category
            layer.ElementTypes = GetElementTypesForCategory(categoryName);
        }

        public ObservableCollection<Element> GetElementTypesForCategory(string category)
        {
            switch (category)
            {
                case "Walls":
                    return WallElements;
                case "Doors":
                    return DoorElements;
                case "Windows":
                    return WindowElements;
                case "Columns":
                    return ColumnElements;
                case "Beams":
                    return BeamElements;
                default:
                    return [];
            }
        }

        public event PropertyChangedEventHandler PropertyChanged;

        private void OnPropertyChanged(string propertyName)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }

        // A new property for storing creation messages for each viewmodel
        private readonly Dictionary<Layer, string> layerMessages = [];

        private double _totalElementsCreated = 0;
        public double TotalElementsCreated
        {
            get { return _totalElementsCreated; }
            set
            {
                _totalElementsCreated = value;
                OnPropertyChanged(nameof(TotalElementsCreated)); // Notify the UI of the change
            }
        }


        private double _progressValue = 0;
        public double ProgressValue
        {
            get { return _progressValue; }
            set
            {
                _progressValue = value;
                OnPropertyChanged(nameof(ProgressValue)); // Notify the UI of the change
            }
        }

        public void CreateElementsInRevit(UIApplication uiApp)
        {
            UIApp = uiApp;

            CreationMessage = string.Empty;

            ProgressValue = 0;
            TotalElementsCreated = 0;

            try
            {
                foreach (Layer layer in Layers)
                {
                    if (layer.SelectedBaseLevel != null && layer.SelectedCategory != null && layer.LayerName != null && layer.SelectedElementType != null)
                    {
                        if (layerModelsAndViewModels.TryGetValue(layer.LayerName, out (BaseLayerModel, BaseLayerViewModel) value))
                        {
                            (BaseLayerModel model, BaseLayerViewModel viewModel) = value;



                            viewModel.Create(uiApp, layer.SelectedElementType);

                            string creationMessage = viewModel.GetCreationMessage();
                            layerMessages[layer] = creationMessage;
                            CreationMessage += $"{layer.LayerName}: {creationMessage}" + Environment.NewLine;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                System.IO.File.WriteAllText(filePath2, ex.ToString());
                TaskDialog.Show("Error", "An error occurred. Please check the CreateElementsInRevit file in your home directory for details.");
            }
        }

    }
}