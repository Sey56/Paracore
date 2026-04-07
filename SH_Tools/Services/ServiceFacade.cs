using Autodesk.Revit.UI;

namespace SH_Tools.Services
{
    public class ServiceFacade
    {
        public LevelsService LevelService { get; }
        public WallTypeService WallTypeService { get; }
        public DoorTypeService DoorTypeService { get; }
        public WindowTypeService WindowTypeService { get; }
        public ColumnTypeService ColumnTypeService { get; }
        public BeamTypeService BeamTypeService { get; }
        // Add other services here...

        public ServiceFacade(UIApplication uiApp)
        {
            LevelService = LevelsService.GetInstance(uiApp);
            WallTypeService = WallTypeService.GetInstance(uiApp);
            DoorTypeService = DoorTypeService.GetInstance(uiApp);
            WindowTypeService = WindowTypeService.GetInstance(uiApp);
            ColumnTypeService = ColumnTypeService.GetInstance(uiApp);
            BeamTypeService = BeamTypeService.GetInstance(uiApp);
            // Get instances of other services here...
        }
    }
}
