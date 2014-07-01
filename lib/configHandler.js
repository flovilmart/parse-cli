var constants = require("./constants"),
	 fs = require('fs'),
	 path = require('path'),
	 _ = require('underscore')

ConfigHandler = {};
module.exports = exports = ConfigHandler;




ConfigHandler.get_global_key = function(parse_root, key){
	config_file = path.join(parse_root, constants.CONFIG_DIR,
                             constants.GLOBAL_FILE);

	if (fs.existsSync(config_file)) {
		reader = fs.readFileSync(file_name);
		config = JSON.parse(reader);
		try{
			return config[constants.GLOBAL][key];
		}catch(e){
			return;
		}
	}else{
		return;
	}
	
}

ConfigHandler.set_global_key = function(parse_root, key, value){
	var config = {};
	var config_file = path.join(parse_root, constants.CONFIG_DIR,
                             constants.GLOBAL_FILE);

	if (fs.existsSync(config_file)) {
		reader = fs.readFileSync(config_file);
		config = JSON.parse(reader);
	}
	if (!config[constants.GLOBAL]) {
		config[constants.GLOBAL] = {};
	}

	config[constants.GLOBAL][key] =  value;
	fs.writeFileSync(file_name, JSON.stringify(config));
}

ConfigHandler.delete_global_key = function(parse_root, key, value){
	var config = {};
	var config_file = path.join(parse_root, constants.CONFIG_DIR,
                             constants.GLOBAL_FILE);

	if (!fs.existsSync(config_file)) {
		return
	}
	reader = fs.readFileSync(config_file);
	config = JSON.parse(reader);
	try{
		delete config[constants.GLOBAL][key];
		fs.writeFileSync(config_file, JSON.stringify(config));
	}catch(e){

	}
}


ConfigHandler.get_info_for_apps = get_info_for_apps = function(parse_root){
	var apps = {};
	var globals = get_app_info_for_file(path.join(parse_root,
                                                 constants.CONFIG_DIR,
                                                 constants.GLOBAL_FILE));
	var locals = get_app_info_for_file(path.join(parse_root,
                                                 constants.CONFIG_DIR,
                                                 constants.LOCAL_FILE));

	return _.extend(apps, globals, locals);
}

ConfigHandler.get_app_info_for_file = get_app_info_for_file = function(filename){
	if (!fs.existsSync(filename)) {
		return {};
	}
	reader = fs.readFileSync(filename);
	config = JSON.parse(reader);
	return config[constants.APPLICATIONS] || {};
}

ConfigHandler.get_keys_for_app = get_keys_for_app = function(parse_root, name){
	var app_info = get_info_for_apps(parse_root);
	if (!app_info[name]) {
		return
	}
	while (app_info[name][constants.LINK]){
		name = app_info[name][constants.LINK];
		if (!app_info[name]) {
			return
		}
	}
	return app_info[name];
}

ConfigHandler.add_app = function(parse_root, name, keys, alias, use_global, output_file){
	console.log(parse_root, constants.CONFIG_DIR, constants.GLOBAL_FILE);
	if (use_global) {
		file_name = path.join(parse_root, constants.CONFIG_DIR, constants.GLOBAL_FILE)
	}else{
		file_name = path.join(parse_root, constants.CONFIG_DIR, constants.LOCAL_FILE)
	}
	var config = {};
	if (fs.existsSync(file_name)) {
		reader = fs.readFileSync(file_name);
		config = JSON.parse(reader);
	}

	apps = {};
	if (config[constants.APPLICATIONS]) {
		apps = config[constants.APPLICATIONS];
	}else{
		config[constants.APPLICATIONS] = apps;
	}

	if (apps[name]) {
		output_file.write('App %s has already been added\n', name)
		return 1;
	}

	if (alias && apps[alias]) {
		output_file.write('App %s has already been added\n', name)
		return 1;
	}

	apps[name] = {
	}

	apps[name][constants.APPLICATION_ID] = keys[0];
   	apps[name][constants.MASTER_KEY] =  keys[1];

	if (alias) {
		apps[alias] = {
      		"link" : name
    	}
	}

	fs.writeFileSync(file_name, JSON.stringify(config));
	return;
}


ConfigHandler.add_alias = function(parse_root, name, alias, use_global, output_file){
	if (use_global) {
		file_name = path.join(parse_root, constants.CONFIG_DIR, constants.GLOBAL_FILE)
	}else{
		file_name = path.join(parse_root, constants.CONFIG_DIR, constants.LOCAL_FILE)
	}

	var config = {};
	if (fs.existsSync(file_name)) {
		reader = fs.readFileSync(file_name);
		config = JSON.parse(reader);
	}

	apps = {};
	if (config[constants.APPLICATIONS]) {
		apps = config[constants.APPLICATIONS];
	}else{
		config[constants.APPLICATIONS] = apps;
	}

	if (apps[alias]) {
		output_file.write('App %s has already been added\n', alias)
		return 1;
	}

	apps[alias] = {};
	apps[alias][constants.LINK] = name;
	fs.writeFileSync(file_name, JSON.stringify(config));
	return;
}

ConfigHandler.set_default_app = function(parse_root, name, output_file){
	var config_file = path.join(parse_root, constants.CONFIG_DIR,
                             constants.GLOBAL_FILE);
	reader = fs.readFileSync(config_file);
	config = JSON.parse(reader);

	if (config[constants.APPLICATIONS]) {
		all_apps = config[constants.APPLICATIONS];
		if (all_apps[name]) {
			if (!all_apps['_default']) {
				all_apps['_default'] = {}
			}
			all_apps['_default'][constants.LINK] = name
			output_file.write('Default app set to %s.\n', name)
		}else{
			output_file.write('Invalid application name. Valid application names:\n')
      		print_list_of_apps(all_apps, output_file)
		}
	}else{
		output_file.write("It looks like you don't have any apps. Make an app at https://parse.com/apps/new!\n")
	}
	fs.writeFileSync(config_file, JSON.stringify(config));
}

ConfigHandler.print_list_of_apps = print_list_of_apps = function(apps, output_file){
	var default_app;
	if (apps['_default']) {
		default_app = apps['_default'][constants.LINK];
	}
	for(var i in Object.keys(apps)){
		var app = Object.keys(apps)[i];
		if (app === '_default') {
			continue;
		}
		if (default_app === app) {
			output_file.write('* ')
		}else{
			output_file.write('  ')
		}
		output_file.write('%s', app)
		if (apps[app][constants.LINK]) {
			output_file.write(' -> %s', apps[app][constants.LINK])
		}
		output_file.write('\n')
	}
}

ConfigHandler.version = function(parse_root, newVersion){
  file_name = path.join(parse_root, constants.CONFIG_DIR,
                           constants.GLOBAL_FILE)

  config = {}
  if(fs.existsSync(file_name)){
  	reader = fs.readFileSync(file_name);
	config = JSON.parse(reader);
  }
  if(newVersion){
  	if (!config[constants.GLOBAL]){
  		config[constants.GLOBAL] = {}
  	}
    config[constants.GLOBAL][constants.PARSE_VERSION] = newVersion
    fs.writeFileSync(file_name, JSON.stringify(config));
  }
  else{
  	if (config[constants.GLOBAL] && config[constants.GLOBAL][constants.PARSE_VERSION]) {
  		newVersion = config[constants.GLOBAL][constants.PARSE_VERSION]
  	}
  }
    
  return newVersion

}

