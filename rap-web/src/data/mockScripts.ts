import { Script } from "@/types/scriptModel";

export const mockScripts: Script[] = [
  {
    id: 'wall-schedule',
    name: 'Wall Schedule Generator', // Mapped from title
    type: "single-file", // Assuming single-file for mocks
    sourcePath: "mock/wall-schedule.cs", // Placeholder
    absolutePath: "/mock/wall-schedule.cs", // Placeholder
    isFavorite: false,
    parameters: [
      {
        name: 'outputType',
        type: 'enum', // Changed from 'select' to 'enum'
        defaultValue: 'Schedule View',
        value: 'Schedule View', // Added value
        description: 'Output Type', // Mapped from label
        options: ['Schedule View', 'Excel Export', 'PDF Report']
      },
      {
        name: 'includeImages',
        type: 'boolean',
        defaultValue: true,
        value: true,
        description: 'Include Images' // Mapped from label
      }
    ],
    metadata: {
      displayName: 'Wall Schedule Generator', // Mapped from title
      lastRun: '2 hours ago',
      dependencies: [], // Placeholder
      description: 'Generates detailed wall schedules with material takeoffs.',
      categories: ['Architectural', 'Schedules'],
      usage_examples: [
        'Generate a schedule for all walls.',
        'Export wall data to Excel.'
      ],
    }
  },
  {
    id: 'room-tag',
    name: 'Room Tag Updater', // Mapped from title
    type: "single-file", // Assuming single-file for mocks
    sourcePath: "mock/room-tag.cs", // Placeholder
    absolutePath: "/mock/room-tag.cs", // Placeholder
    isFavorite: true,
    parameters: [
      {
        name: 'updateMethod',
        type: 'enum', // Changed from 'select' to 'enum'
        defaultValue: 'Selected Views',
        value: 'Selected Views',
        description: 'Update Method', // Mapped from label
        options: ['Selected Views', 'All Views', 'Current View Only']
      }
    ],
    metadata: {
      displayName: 'Room Tag Updater', // Mapped from title
      lastRun: '1 day ago',
      dependencies: [], // Placeholder
      description: 'Updates all room tags with current room data and parameters.',
      categories: ['Architectural', 'Tags'],
      usage_examples: [
        'Update tags in selected views.',
        'Update tags in the current view only.'
      ],
    }
  },
  // Add other mock scripts here...
];