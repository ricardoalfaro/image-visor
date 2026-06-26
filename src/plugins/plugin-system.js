export function createPluginRegistry() {
  const plugins = new Map();

  return {
    register(plugin) {
      if (!plugin?.id) {
        throw new Error("Plugin id is required");
      }

      plugins.set(plugin.id, plugin);
      return plugin;
    },

    get(pluginId) {
      return plugins.get(pluginId) || null;
    },

    list() {
      return [...plugins.values()];
    },
  };
}
