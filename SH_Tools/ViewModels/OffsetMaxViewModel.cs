using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using SH_Tools.Commands;
using SH_Tools.Handlers;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Input;

namespace SH_Tools.ViewModels
{
    public class OffsetMaxViewModel : INotifyPropertyChanged
    {
        private ObservableCollection<Level> _levels;
        private Level? _selectedLevel;
        private bool _isAllLevels;
        private bool _isSpecificLevel;
        private bool _isSlab;
        private bool _isBeam;
        private bool _isBore;
        private string _feedbackMessage;

        public ObservableCollection<Level> Levels
        {
            get => _levels;
            set
            {
                _levels = value;
                OnPropertyChanged();
            }
        }

        public Level? SelectedLevel
        {
            get => _selectedLevel;
            set
            {
                _selectedLevel = value;
                OnPropertyChanged();
                UpdateOffsetOptionsState();
            }
        }

        public bool IsAllLevels
        {
            get => _isAllLevels;
            set
            {
                _isAllLevels = value;
                OnPropertyChanged();
                UpdateOffsetOptionsState();
            }
        }

        public bool IsSpecificLevel
        {
            get => _isSpecificLevel;
            set
            {
                _isSpecificLevel = value;
                OnPropertyChanged();
                UpdateOffsetOptionsState();
            }
        }

        public bool IsSlab
        {
            get => _isSlab;
            set
            {
                _isSlab = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(CanApplyOffsets));
            }
        }

        public bool IsBeam
        {
            get => _isBeam;
            set
            {
                if (_isBeam != value)
                {
                    _isBeam = value;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(CanApplyOffsets));

                    // Deselect "Boring" if "Beams" is deselected
                    if (!_isBeam)
                    {
                        IsBore = false;
                    }
                }
            }
        }

        public bool IsBore
        {
            get => _isBore;
            set
            {
                _isBore = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(CanApplyOffsets));
            }
        }

        public string FeedbackMessage
        {
            get => _feedbackMessage;
            set
            {
                _feedbackMessage = value;
                OnPropertyChanged();
            }
        }


        private readonly ExternalEvent _offsetMaxEvent;
        private readonly OffsetMaxEventHandler _offsetMaxEventHandler;

        public ICommand ApplyOffsetMaxCommand { get; set; }

        public OffsetMaxViewModel()
        {
            _levels = new ObservableCollection<Level>();
            _feedbackMessage = string.Empty;
            Levels = [];
            ApplyOffsetMaxCommand = new RelayCommand(ApplyOffsets, CanApplyOffsets);

            // Set default selection
            IsSpecificLevel = true;

            // Initialize the external event and handler
            _offsetMaxEventHandler = new OffsetMaxEventHandler(this);
            _offsetMaxEvent = ExternalEvent.Create(_offsetMaxEventHandler);

            // Initialize checkboxes as unchecked and disabled
            IsSlab = false;
            IsBeam = false;
            IsBore = false;

        }

        private bool CanApplyOffsets(object? obj)
        {
            return (IsAllLevels || (IsSpecificLevel && SelectedLevel != null)) && (IsSlab || IsBeam || IsBore);
        }

        private void ApplyOffsets(object? obj)
        {
            if (IsBore)
            {
                MessageBoxResult result = MessageBox.Show("Warning: OffsetMax will disjoin your walls to create openings and after that will join them back again. Are you sure you want to proceed?", "Confirmation", MessageBoxButton.YesNo, MessageBoxImage.Warning);
                if (result != MessageBoxResult.Yes)
                {
                    return; // Exit if the user does not confirm
                }
            }

            // Apply offsets based on user choices
            if (IsAllLevels)
            {
                foreach (var level in Levels)
                {
                    _offsetMaxEventHandler.ViewModel = this;
                    _offsetMaxEventHandler.Level = level;
                    _offsetMaxEvent.Raise();
                }
            }
            else if (IsSpecificLevel && SelectedLevel != null)
            {
                _offsetMaxEventHandler.ViewModel = this;
                _offsetMaxEventHandler.Level = SelectedLevel;
                _offsetMaxEvent.Raise();
            }
        }



        private void UpdateOffsetOptionsState()
        {
            bool canSelectOffsetOptions = IsAllLevels || (IsSpecificLevel && SelectedLevel != null);
            OnPropertyChanged(nameof(IsLevelSelectionEnabled));
        }

        public bool IsLevelSelectionEnabled => IsAllLevels || (IsSpecificLevel && SelectedLevel != null);

        public event PropertyChangedEventHandler? PropertyChanged;

        protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName ?? string.Empty));
        }

    }
}
