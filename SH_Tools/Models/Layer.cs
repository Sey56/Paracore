using Autodesk.Revit.DB;
using SH_Tools.ViewModels;
using System.Collections.ObjectModel;
using System.ComponentModel;

namespace SH_Tools.Models
{
    public class Layer : INotifyPropertyChanged
    {
        private double _sillHeight;
        public double SillHeight
        {
            get => _sillHeight;
            set
            {
                if (_sillHeight != value)
                {
                    _sillHeight = value;
                    OnPropertyChanged(nameof(SillHeight));

                    // Execute SillHeightSetCommand here
                    if (_cadViewModel.SillHeightSetCommand.CanExecute(this))
                    {
                        _cadViewModel.SillHeightSetCommand.Execute(this);
                    }
                }
            }
        }

        private ObservableCollection<string> _cadLayerNames;
        public ObservableCollection<string> CadLayerNames
        {
            get { return _cadLayerNames; }
            set
            {
                if (_cadLayerNames != value)
                {
                    _cadLayerNames = value;
                    OnPropertyChanged(nameof(CadLayerNames));
                }
            }
        }

        private ObservableCollection<Element> _levelElements;
        public ObservableCollection<Element> LevelElements
        {
            get { return _levelElements; }
            set
            {
                if (_levelElements != value)
                {
                    _levelElements = value;
                    OnPropertyChanged(nameof(LevelElements));
                }
            }
        }

        private List<string> _categoryNames;
        public List<string> CategoryNames
        {
            get { return _categoryNames; }
            set
            {
                if (_categoryNames != value)
                {
                    _categoryNames = value;
                    OnPropertyChanged(nameof(CategoryNames));
                }
            }
        }

        private string _selectedCategory;
        public string SelectedCategory
        {
            get { return _selectedCategory; }
            set
            {
                if (_selectedCategory != value)
                {
                    _selectedCategory = value;
                    OnPropertyChanged(nameof(SelectedCategory));

                    // Update CadLayerNames based on the selected category
                    UpdateLayerNames(_selectedCategory);

                    // Update ElementTypes based on the selected category
                    ElementTypes = _cadViewModel.GetElementTypesForCategory(_selectedCategory);
                }
            }
        }

        private ObservableCollection<Element> _elementTypes;
        public ObservableCollection<Element> ElementTypes
        {
            get { return _elementTypes; }
            set
            {
                if (_elementTypes != value)
                {
                    _elementTypes = value;
                    OnPropertyChanged(nameof(ElementTypes));
                }
            }
        }

        private Element _selectedElementType;
        public Element SelectedElementType
        {
            get { return _selectedElementType; }
            set
            {
                if (_selectedElementType != value)
                {
                    _selectedElementType = value;
                    OnPropertyChanged(nameof(SelectedElementType));

                    // Call OnUserSelectedElementType here
                    _cadViewModel.OnUserSelectedElementType(this);
                }
            }
        }

        private string _layerName;
        public string LayerName
        {
            get { return _layerName; }
            set
            {
                if (_layerName != value)
                {
                    _layerName = value;
                    OnPropertyChanged(nameof(LayerName));
                }
            }
        }

        private string _displayName;
        public string DisplayName
        {
            get { return _displayName; }
            set
            {
                _displayName = value;
                OnPropertyChanged(nameof(DisplayName));
            }
        }

        private Color _layerColor;
        public Color LayerColor
        {
            get => _layerColor;
            set
            {
                _layerColor = value;
                OnPropertyChanged(nameof(LayerColor));
            }
        }

        public BaseLayerModel Model { get; set; }

        public event PropertyChangedEventHandler? PropertyChanged;

        private void OnPropertyChanged(string propertyName)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }

        public override string ToString()
        {
            return string.Empty;
        }

        private Level _selectedBaseLevel;
        public Level SelectedBaseLevel
        {
            get => _selectedBaseLevel;
            set
            {
                _selectedBaseLevel = value;
                OnPropertyChanged(nameof(SelectedBaseLevel));
            }
        }

        private Level _selectedTopLevel;
        public Level SelectedTopLevel
        {
            get => _selectedTopLevel;
            set
            {
                _selectedTopLevel = value;
                OnPropertyChanged(nameof(SelectedTopLevel));
            }
        }

        private readonly CadViewModel _cadViewModel;

        public Layer(CadViewModel cadViewModel)
        {
            _cadViewModel = cadViewModel;
        }

        public void UpdateLayerNames(string selectedCategory)
        {
            // Get the layer names for the selected category from the _cadViewModel
            CadLayerNames = new ObservableCollection<string>(_cadViewModel.CadLayerNamesByCategory[selectedCategory]);
        }
    }
}
