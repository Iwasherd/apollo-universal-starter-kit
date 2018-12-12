const shell = require('shelljs');
const fs = require('fs');
const DomainSchema = require('@domain-schema/core').default;
const { pascalize, decamelize } = require('humps');
const { startCase } = require('lodash');
const { BASE_PATH } = require('../config');

/**
 * Copies the templates to the destination directory.
 *
 * @param destinationPath - The destination path for a new module.
 * @param templatesPath - The path to the templates for a new module.
 * @param location - The location for a new module [client|server|both].
 */
function copyFiles(destinationPath, templatesPath, location) {
  shell.cp('-R', `${templatesPath}/${location}/*`, destinationPath);
}

/**
 * Renames the templates in the destination directory.
 *
 * @param destinationPath - The destination path of a new module.
 * @param moduleName - The name of a new module.
 */
function renameFiles(destinationPath, moduleName) {
  const Module = pascalize(moduleName);

  // change to destination directory
  shell.cd(destinationPath);

  // rename files
  shell.ls('-Rl', '.').forEach(entry => {
    if (entry.isFile()) {
      shell.mv(entry.name, entry.name.replace('Module', Module));
    }
  });

  // replace module names
  shell.ls('-Rl', '.').forEach(entry => {
    if (entry.isFile()) {
      shell.sed('-i', /\$module\$/g, moduleName, entry.name);
      shell.sed('-i', /\$_module\$/g, decamelize(moduleName), entry.name);
      shell.sed('-i', /\$-module\$/g, decamelize(moduleName, { separator: '-' }), entry.name);
      shell.sed('-i', /\$Module\$/g, Module, entry.name);
      shell.sed('-i', /\$MoDuLe\$/g, startCase(moduleName), entry.name);
      shell.sed('-i', /\$MODULE\$/g, moduleName.toUpperCase(), entry.name);
    }
  });
}

/**
 * Gets the computed path of the module or modules dir path.
 *
 * @param location - The location for a new module [client|server|both].
 * @param moduleName - The name of a new module.
 * @returns {string} - Return the computed path
 */
function computeModulesPath(location, options, moduleName = '') {
  return options.old || (moduleName === '' && location.split('-')[0] === 'server')
    ? `${BASE_PATH}/packages/${location.split('-')[0]}/src/modules/${moduleName}`
    : moduleName === ''
      ? `${BASE_PATH}/packages/${location.split('-')[0]}/src/`
      : `${BASE_PATH}/modules/${moduleName}/${location}`;
}

/**
 * Gets the computed path of the root module path.
 *
 * @param moduleName - The name of a new module.
 * @returns {string} - Return the computed path
 */
function computeRootModulesPath(moduleName) {
  return `${BASE_PATH}/modules/${moduleName}`;
}

/**
 * Gets the computed package path for the module.
 *
 * @param moduleName - The name of a new module.
 * @param location - The location for a new module [client|server|both].
 * @returns {string} - Return the computed path
 */
function computeModulePackageName(location, options, moduleName) {
  return options.old
    ? `./${moduleName}`
    : `@module/${decamelize(moduleName, {
        separator: '-'
      })}-${location}`;
}

/**
 * Gets the computed package path for the module.
 *
 * @param moduleName - The name of a new module.
 * @returns {string} - Return the computed path
 */
function computePackagePath(location) {
  return `${BASE_PATH}/packages/${location.split('-')[0]}/package.json`;
}

/**
 * Add symlink
 *
 * @param moduleName - The name of a new module.
 * @param location - The location for a new module [client|server].
 */
function addSymlink(location, moduleName) {
  shell.ln(
    '-s',
    `${BASE_PATH}/modules/${moduleName}/${location}`,
    `${BASE_PATH}/node_modules/@module/${decamelize(moduleName, {
      separator: '-'
    })}-${location}`
  );
}

/**
 * Remove symlink
 *
 * @param moduleName - The name of a new module.
 * @param location - The location for a new module [client|server].
 */
function removeSymlink(location, moduleName) {
  shell.rm(
    `${BASE_PATH}/modules/${moduleName}/${location}`,
    `${BASE_PATH}/node_modules/@module/${decamelize(moduleName, {
      separator: '-'
    })}-${location}`
  );
}

/**
 * Run prettier on file that was changed.
 *
 * @param pathToFile
 */
function runPrettier(pathToFile) {
  if (fs.existsSync(pathToFile)) {
    shell.exec(`prettier --print-width 120 --single-quote --loglevel error --write ${pathToFile}`);
  }
}

/**
 *
 * @param value
 * @param update
 * @returns {string}
 */
function generateField(value, update = false) {
  let result = '';
  const hasTypeOf = targetType => value.type === targetType || value.type.prototype instanceof targetType;
  if (hasTypeOf(Boolean)) {
    result += 'Boolean';
  } else if (hasTypeOf(DomainSchema.ID)) {
    result += 'ID';
  } else if (hasTypeOf(DomainSchema.Int)) {
    result += 'Int';
  } else if (hasTypeOf(DomainSchema.Float)) {
    result += 'Float';
  } else if (hasTypeOf(String)) {
    result += 'String';
  } else if (hasTypeOf(Date)) {
    result += 'Date';
  } else if (hasTypeOf(DomainSchema.DateTime)) {
    result += 'DateTime';
  } else if (hasTypeOf(DomainSchema.Time)) {
    result += 'Time';
  }

  if (!update && !value.optional) {
    result += '!';
  }

  return result;
}

/**
 *
 * @param pathToFileWithExports
 * @param exportName
 * @param importString
 */
function updateFileWithExports({ pathToFileWithExports, exportName, importString }) {
  const exportGraphqlContainer = `\nexport default {\n  ${exportName}\n};\n`;

  if (fs.existsSync(pathToFileWithExports)) {
    const generatedContainerData = fs.readFileSync(pathToFileWithExports);
    const generatedContainer = generatedContainerData.toString().trim();
    if (generatedContainer.length > 1) {
      const index = generatedContainer.lastIndexOf("';");
      const computedIndex = index >= 0 ? index + 3 : false;
      if (computedIndex) {
        let computedGeneratedContainer =
          generatedContainer.slice(0, computedIndex) +
          importString +
          generatedContainer.slice(computedIndex, generatedContainer.length);
        computedGeneratedContainer = computedGeneratedContainer.replace(/(,|)\s};/g, `,\n  ${exportName}\n};`);
        return fs.writeFileSync(pathToFileWithExports, computedGeneratedContainer);
      }
    }
    return fs.writeFileSync(pathToFileWithExports, importString + exportGraphqlContainer);
  }
}

/**
 *
 * @param pathToFileWithExports
 * @param exportName
 */
function deleteFromFileWithExports(pathToFileWithExports, exportName) {
  if (fs.existsSync(pathToFileWithExports)) {
    const generatedElementData = fs.readFileSync(pathToFileWithExports);
    const reg = `(\\n\\s\\s${exportName}(.|)|import (${exportName}|{ ${exportName} }).+;\\n+(?!ex))`;
    const generatedElement = generatedElementData.toString().replace(new RegExp(reg, 'g'), '');
    fs.writeFileSync(pathToFileWithExports, generatedElement);

    runPrettier(pathToFileWithExports);
  }
}

module.exports = {
  renameFiles,
  copyFiles,
  computeModulesPath,
  computeRootModulesPath,
  computePackagePath,
  computeModulePackageName,
  addSymlink,
  removeSymlink,
  runPrettier,
  generateField,
  updateFileWithExports,
  deleteFromFileWithExports
};
