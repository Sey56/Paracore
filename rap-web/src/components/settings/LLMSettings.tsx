import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';

interface LLMSettingsProps {
  isAuthenticated: boolean;
  isReadOnly?: boolean;
}

const llmProviders = [
  {
    name: 'Google',
    models: [
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-2.0-flash-exp',
      'gemini-2.0-pro-exp',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-3-flash-preview',
      'gemini-3-pro-preview',
    ],
    apiKeyName: 'GEMINI_API_KEY',
  },
  {
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    apiKeyName: 'OPENAI_API_KEY',
  },
  {
    name: 'Deepseek',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    apiKeyName: 'DEEPSEEK_API_KEY',
  },
  {
    name: 'OpenRouter',
    models: [
      'google/gemini-2.0-flash-exp:free',
      'google/gemini-flash-1.5',
      'deepseek/deepseek-r1',
      'deepseek/deepseek-chat',
      'x-ai/grok-2',
      'x-ai/grok-2-1212',
      'x-ai/grok-2-vision-1212',
      'x-ai/grok-code-fast-1',
      'meta-llama/llama-3.1-70b-instruct',
      'anthropic/claude-3-haiku',
      'openai/gpt-4o-mini',
      'custom'
    ],
    apiKeyName: 'OPENROUTER_API_KEY',
  },
  {
    name: 'Anthropic',
    models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
    apiKeyName: 'ANTHROPIC_API_KEY',
  },
];

const LLMSettings: React.FC<LLMSettingsProps> = ({ isAuthenticated, isReadOnly = false }) => {
  const { user } = useAuth();
  const { showNotification } = useNotifications();

  const [selectedProvider, setSelectedProvider] = useState<string>(llmProviders[0].name);
  const [selectedModel, setSelectedModel] = useState<string>(llmProviders[0].models[0]);
  const [customModelValue, setCustomModelValue] = useState<string>('');
  const [apiKeyName, setApiKeyName] = useState<string>('');
  const [apiKeyValue, setApiKeyValue] = useState<string>('');

  useEffect(() => {
    // Load settings from localStorage when the component mounts
    const savedProviderName = localStorage.getItem('llmProvider');
    const savedModelName = localStorage.getItem('llmModel');
    const savedApiKeyName = localStorage.getItem('llmApiKeyName');
    const savedApiKeyValue = localStorage.getItem('llmApiKeyValue');

    let initialProvider = llmProviders[0].name;
    let initialModel = llmProviders[0].models[0];

    if (savedProviderName) {
      initialProvider = savedProviderName;
      const provider = llmProviders.find(p => p.name === savedProviderName);
      if (provider) {
        if (savedModelName) {
          if (provider.models.includes(savedModelName)) {
            initialModel = savedModelName;
          } else {
            initialModel = 'custom';
            setCustomModelValue(savedModelName);
          }
        } else if (provider.models.length > 0) {
          initialModel = provider.models[0];
        }
      }
    }

    setSelectedProvider(initialProvider);
    setSelectedModel(initialModel);

    if (savedApiKeyName) {
      setApiKeyName(savedApiKeyName);
    }
    if (savedApiKeyValue) {
      setApiKeyValue(savedApiKeyValue);
    }
  }, []);

  const handleSave = () => {
    if (isReadOnly) return;
    const finalModel = selectedModel === 'custom' ? customModelValue : selectedModel;
    localStorage.setItem('llmProvider', selectedProvider);
    localStorage.setItem('llmModel', finalModel);
    localStorage.setItem('llmApiKeyName', apiKeyName);
    localStorage.setItem('llmApiKeyValue', apiKeyValue);
    showNotification('LLM settings saved successfully!', 'success');
  };

  const handleProviderChange = (providerName: string) => {
    if (isReadOnly) return;
    setSelectedProvider(providerName);
    const provider = llmProviders.find(p => p.name === providerName);
    if (provider && provider.models.length > 0) {
      setSelectedModel(provider.models[0]);
    }
  };

  const providerModels = llmProviders.find(p => p.name === selectedProvider)?.models || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">LLM Configuration</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Configure your preferred Large Language Model provider and API key.
        </p>
        {isReadOnly && (
          <div className="mt-2 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-2 rounded text-sm dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-200">
            LLM Cloud configuration is read-only in the Free Personal Edition.
          </div>
        )}
      </div>

      <fieldset disabled={isReadOnly} className="disabled:opacity-60">
        <div className="grid grid-cols-1 gap-y-6 sm:grid-cols-2 sm:gap-x-8">
          {/* LLM Provider Selection */}
          <div>
            <label htmlFor="llmProvider" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              LLM Provider
            </label>
            <select
              id="llmProvider"
              name="llmProvider"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 disabled:bg-gray-100 dark:disabled:bg-gray-800"
              value={selectedProvider}
              onChange={(e) => handleProviderChange(e.target.value)}
              disabled={isReadOnly}
            >
              {llmProviders.map((provider) => (
                <option key={provider.name} value={provider.name}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>

          {/* LLM Model Selection */}
          <div>
            <label htmlFor="llmModel" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              LLM Model
            </label>
            <select
              id="llmModel"
              name="llmModel"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 disabled:bg-gray-100 dark:disabled:bg-gray-800"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isReadOnly}
            >
              {providerModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Model Input (shown if 'custom' is selected) */}
          {selectedModel === 'custom' && (
            <div className="sm:col-span-2">
              <label htmlFor="customModelValue" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Custom Model ID
              </label>
              <input
                type="text"
                id="customModelValue"
                name="customModelValue"
                className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 dark:disabled:bg-gray-800"
                value={customModelValue}
                onChange={(e) => setCustomModelValue(e.target.value)}
                placeholder="e.g., google/gemini-2.0-flash-exp:free"
                disabled={isReadOnly}
              />
            </div>
          )}

          {/* API Key Name Input */}
          <div>
            <label htmlFor="apiKeyName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              API Key Name
            </label>
            <input
              type="text"
              id="apiKeyName"
              name="apiKeyName"
              className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 dark:disabled:bg-gray-800"
              value={apiKeyName}
              onChange={(e) => setApiKeyName(e.target.value)}
              placeholder="e.g., GEMINI_API_KEY"
              disabled={isReadOnly}
            />
          </div>

          {/* API Key Value Input */}
          <div>
            <label htmlFor="apiKeyValue" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              API Key Value
            </label>
            <input
              type="password"
              id="apiKeyValue"
              name="apiKeyValue"
              className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 dark:disabled:bg-gray-800"
              value={apiKeyValue}
              onChange={(e) => setApiKeyValue(e.target.value)}
              placeholder="Enter your API key securely"
              disabled={isReadOnly}
            />
          </div>
        </div>

        <div className="pt-5">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={isReadOnly}
              className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Settings
            </button>
          </div>
        </div>
      </fieldset>
    </div>
  );
};

export default LLMSettings;
