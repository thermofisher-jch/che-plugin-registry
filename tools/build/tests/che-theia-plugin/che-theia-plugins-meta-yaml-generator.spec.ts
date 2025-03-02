/**********************************************************************
 * Copyright (c) 2020-2021 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';

import * as fs from 'fs-extra';
import * as path from 'path';

import { CheTheiaPluginAnalyzerMetaInfo } from '../../src/che-theia-plugin/che-theia-plugin-analyzer-meta-info';
import { CheTheiaPluginMetaInfo } from '../../src/build';
import { CheTheiaPluginsMetaYamlGenerator } from '../../src/che-theia-plugin/che-theia-plugins-meta-yaml-generator';
import { Container } from 'inversify';
import { Sidecar } from '../../src/sidecar/sidecar';
import { VsixInfo } from '../../src/extensions/vsix-info';

describe('Test CheTheiaPluginsAnalyzer', () => {
  let container: Container;

  let cheTheiaPluginsMetaYamlGenerator: CheTheiaPluginsMetaYamlGenerator;
  const originalConsoleWarn: any = console.warn;
  const originalConsoleError: any = console.error;

  const fakeImage = 'quay-fake.io/my-image:123';

  const sideCarGetDockerImageFor = jest.fn();
  const sidecar: any = {
    getDockerImageFor: sideCarGetDockerImageFor,
  };

  async function generatePluginMetaInfo(id: string): Promise<CheTheiaPluginMetaInfo> {
    const extensionLink = `https://fake-${id.replace(/\//g, '-')}-first.vsix`;
    const vscodeGoPackageJsonPath = path.resolve(__dirname, '..', '_data', 'packages', 'vscode-go-package.json');
    const vscodeGoPackageJsonContent = await fs.readFile(vscodeGoPackageJsonPath, 'utf-8');
    const packageJson = JSON.parse(vscodeGoPackageJsonContent);
    const packageNlsJson = {
      key1: 'value1',
    };
    const vsixInfos = new Map<string, VsixInfo>();

    const cheTheiaPluginId = id;
    const cheTheiaPlugin: CheTheiaPluginAnalyzerMetaInfo = {
      id: cheTheiaPluginId,
      featured: false,
      aliases: [],
      preferences: {
        'my.preferences1': true,
        'debug.node.useV3': false,
      },
      sidecar: {
        name: 'my-name',
        memoryRequest: '1m',
        memoryLimit: '2m',
        cpuRequest: '3m',
        cpuLimit: '4m',
        command: ['/bin/sh'],
        args: ['-c', './entrypoint.sh'],
        env: [
          {
            name: 'my-env-name',
            value: 'my-env-value',
          },
        ],
        mountSources: true,
        endpoints: [
          {
            name: 'configuration-endpoint',
            public: true,
            targetPort: 61436,
            attributes: {
              protocol: 'http',
            },
          },
          {
            name: 'report-endpoint',
            public: true,
            targetPort: 61435,
            attributes: {
              protocol: 'http',
            },
          },
        ],
        volumeMounts: [
          { path: '/home/theia/.ivy2', name: 'ivy2' },
          { path: '/home/theia/.m2', name: '.m2' },
        ],
        image: 'fake-image',
      },
      extension: extensionLink,
      repository: {
        url: 'http://fake-repo',
        revision: 'main',
      },
      vsixInfos,
    };
    const vsixInfo: VsixInfo = {
      uri: extensionLink,
      cheTheiaPlugin,
      downloadedArchive: '/fake/downloaded-archive',
      unpackedArchive: '/fake/unpacked-archive',
      creationDate: '2020-01-01',
      unpackedExtensionRootDir: '/fake/root-dir',
      packageJson,
      packageNlsJson,
    };

    vsixInfos.set(extensionLink, vsixInfo);
    const cheTheiaPluginMetaInfo: CheTheiaPluginMetaInfo = {
      ...cheTheiaPlugin,
      id: cheTheiaPluginId,
    };
    return cheTheiaPluginMetaInfo;
  }

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    console.error = jest.fn();
    console.warn = jest.fn();
    container = new Container();
    container.bind(CheTheiaPluginsMetaYamlGenerator).toSelf().inSingletonScope();
    container.bind(Sidecar).toConstantValue(sidecar);
    sideCarGetDockerImageFor.mockResolvedValue(fakeImage);
    cheTheiaPluginsMetaYamlGenerator = container.get(CheTheiaPluginsMetaYamlGenerator);
  });
  afterEach(() => {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  test('basics', async () => {
    const anotherPluginMetaInfo = await generatePluginMetaInfo('foo/bar');
    anotherPluginMetaInfo.extension = 'http://second.vsix';
    const yetAnotherPluginMetaInfo = await generatePluginMetaInfo('yet/bar');
    yetAnotherPluginMetaInfo.extension = 'http://third.vsix';
    yetAnotherPluginMetaInfo.vsixInfos = new Map([
      ...anotherPluginMetaInfo.vsixInfos,
      ...yetAnotherPluginMetaInfo.vsixInfos,
    ]);

    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    cheTheiaPluginMetaInfo.extension = 'http://first.vsix';
    cheTheiaPluginMetaInfo.metaYaml = {
      extraDependencies: ['foo/bar', 'yet/bar'],
      skipDependencies: ['hello/world'],
    };
    const vsixInfo = cheTheiaPluginMetaInfo.vsixInfos.values().next().value;
    (vsixInfo as any).packageJson.extensionDependencies = ['foo.bar'];

    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [
      cheTheiaPluginMetaInfo,
      anotherPluginMetaInfo,
      yetAnotherPluginMetaInfo,
    ];
    const result = await cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos);
    expect(result).toBeDefined();
    expect(result.length).toBe(3);
    const metaYamlInfo = result[0];

    const metaYamlInfoSpec = metaYamlInfo.spec;
    expect(metaYamlInfoSpec).toBeDefined();
    const metaYamlInfoSpecContainers = metaYamlInfoSpec.containers;
    if (!metaYamlInfoSpecContainers) {
      throw new Error('No spec containers');
    }
    expect(metaYamlInfoSpecContainers).toBeDefined();
    expect(metaYamlInfoSpecContainers.length).toBe(1);
    expect(metaYamlInfoSpecContainers[0].image).toBe(fakeImage);
    const theiaPreferencesEnv = metaYamlInfoSpecContainers[0].env?.find(
      env => env.name === CheTheiaPluginsMetaYamlGenerator.CHE_THEIA_SIDECAR_PREFERENCES
    );
    expect(theiaPreferencesEnv).toBeDefined();
    expect(theiaPreferencesEnv?.value).toEqual('{"my.preferences1":true,"debug.node.useV3":false}');
    expect(metaYamlInfoSpecContainers[0].image).toBe(fakeImage);
    expect(metaYamlInfoSpecContainers[0].command).toStrictEqual(['/bin/sh']);
    expect(metaYamlInfoSpecContainers[0].args).toStrictEqual(['-c', './entrypoint.sh']);

    // check extensions
    const metaYamlInfoSpecExtensions = metaYamlInfoSpec.extensions;
    if (!metaYamlInfoSpecExtensions) {
      throw new Error('No spec extensions');
    }
    expect(metaYamlInfoSpecExtensions).toStrictEqual(['http://first.vsix', 'http://second.vsix', 'http://third.vsix']);

    // check vsixInfos
    const vsixInfos = metaYamlInfo.vsixInfos;
    // need to have information on all dependencies
    expect(vsixInfos.size).toBe(3);
    expect(vsixInfos.get('https://fake-my-first-plugin-first.vsix')).toBeDefined();
    expect(vsixInfos.get('https://fake-foo-bar-first.vsix')).toBeDefined();
  });

  test('basics without metaYaml information', async () => {
    const anotherPluginMetaInfo = await generatePluginMetaInfo('foo/bar');
    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    cheTheiaPluginMetaInfo.metaYaml = {};
    const vsixInfo = cheTheiaPluginMetaInfo.vsixInfos.values().next().value;
    (vsixInfo as any).packageJson.extensionDependencies = ['foo.bar'];

    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [cheTheiaPluginMetaInfo, anotherPluginMetaInfo];
    const result = await cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos);
    expect(result).toBeDefined();
    expect(result.length).toBe(2);
    const metaYamlInfo = result[0];

    const metaYamlInfoSpec = metaYamlInfo.spec;
    expect(metaYamlInfoSpec).toBeDefined();
    const metaYamlInfoSpecContainers = metaYamlInfoSpec.containers;
    if (!metaYamlInfoSpecContainers) {
      throw new Error('No spec containers');
    }
    expect(metaYamlInfoSpecContainers).toBeDefined();
    expect(metaYamlInfoSpecContainers.length).toBe(1);
    expect(metaYamlInfoSpecContainers[0].image).toBe(fakeImage);
    const theiaPreferencesEnv = metaYamlInfoSpecContainers[0].env?.find(
      env => env.name === CheTheiaPluginsMetaYamlGenerator.CHE_THEIA_SIDECAR_PREFERENCES
    );
    expect(theiaPreferencesEnv).toBeDefined();
    expect(theiaPreferencesEnv?.value).toEqual('{"my.preferences1":true,"debug.node.useV3":false}');
    expect(metaYamlInfoSpecContainers[0].image).toBe(fakeImage);
    expect(metaYamlInfoSpecContainers[0].command).toStrictEqual(['/bin/sh']);
    expect(metaYamlInfoSpecContainers[0].args).toStrictEqual(['-c', './entrypoint.sh']);
  });

  test('basics without dependency', async () => {
    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    cheTheiaPluginMetaInfo.metaYaml = {};
    const vsixInfo = cheTheiaPluginMetaInfo.vsixInfos.values().next().value;
    (vsixInfo as any).packageJson.extensionDependencies = ['foo.bar'];

    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [cheTheiaPluginMetaInfo];
    await expect(cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos)).rejects.toThrow(
      'Unable to find the dependency id foo/bar required by plug-in my/first/plugin'
    );
  });

  test('basics without sidecar', async () => {
    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    delete cheTheiaPluginMetaInfo.sidecar;
    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [cheTheiaPluginMetaInfo];
    const result = await cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos);
    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    const metaYamlInfo = result[0];
    const metaYamlInfoSpec = metaYamlInfo.spec;
    expect(metaYamlInfoSpec).toBeDefined();
    expect(metaYamlInfoSpec.containers).toBeUndefined();
  });

  test('basics with sidecar but only the image field', async () => {
    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    cheTheiaPluginMetaInfo.sidecar = { image: 'fake-simple-image' };
    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [cheTheiaPluginMetaInfo];
    const result = await cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos);
    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    const metaYamlInfo = result[0];

    const metaYamlInfoSpec = metaYamlInfo.spec;
    expect(metaYamlInfoSpec).toBeDefined();
    const metaYamlInfoSpecContainers = metaYamlInfoSpec.containers;
    if (!metaYamlInfoSpecContainers) {
      throw new Error('No spec containers');
    }
    expect(metaYamlInfoSpecContainers).toBeDefined();
    expect(metaYamlInfoSpecContainers.length).toBe(1);
    expect(metaYamlInfoSpecContainers[0].image).toBe(fakeImage);
  });

  test('nls property without nls field', async () => {
    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    // remove preferences as well
    delete cheTheiaPluginMetaInfo.preferences;

    delete Array.from(cheTheiaPluginMetaInfo.vsixInfos.values())[0].packageNlsJson;
    const packageJson = Array.from(cheTheiaPluginMetaInfo.vsixInfos.values())[0].packageJson;
    if (packageJson) {
      packageJson.description = '%my-nls-description%';
    } else {
      throw new Error('invalid setup');
    }

    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [cheTheiaPluginMetaInfo];
    const result = await cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos);
    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    // property is not replaced by nls as it is not there
    expect(result[0].description).toBe(packageJson.description);
  });

  test('nls property with nls field', async () => {
    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    const nslPackageJson = Array.from(cheTheiaPluginMetaInfo.vsixInfos.values())[0].packageNlsJson;
    const packageJson = Array.from(cheTheiaPluginMetaInfo.vsixInfos.values())[0].packageJson;
    const nslPropertyName = '%my-nls-description%';
    const nslPropertyValue = 'my-value-specified-in-nls';

    if (packageJson && nslPackageJson) {
      packageJson.description = nslPropertyName;
      nslPackageJson[nslPropertyName.substring(1, nslPropertyName.length - 1)] = nslPropertyValue;
    } else {
      throw new Error('invalid setup');
    }

    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [cheTheiaPluginMetaInfo];
    const result = await cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos);
    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    // property is replaced by nls as it is specified
    expect(result[0].description).toBe(nslPropertyValue);
  });

  test('no description should use the name instead', async () => {
    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    const packageJson = Array.from(cheTheiaPluginMetaInfo.vsixInfos.values())[0].packageJson;
    if (packageJson) {
      delete packageJson.description;
    } else {
      throw new Error('Invalid package.json');
    }
    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [cheTheiaPluginMetaInfo];
    const result = await cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos);
    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].description).toBe(packageJson.name);
    expect(console.error as jest.Mock).toHaveBeenCalled();
    const call = (console.error as jest.Mock).mock.calls[0];
    expect(call[0]).toContain('No description field in package.json found for');
  });

  test('no displayName but a description should use the description instead', async () => {
    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    const packageJson = Array.from(cheTheiaPluginMetaInfo.vsixInfos.values())[0].packageJson;
    if (packageJson) {
      delete packageJson.displayName;
    } else {
      throw new Error('Invalid package.json');
    }
    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [cheTheiaPluginMetaInfo];
    const result = await cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos);
    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].displayName).toBe(packageJson.description);
  });

  test('no displayName and no description should use the name instead', async () => {
    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    const packageJson = Array.from(cheTheiaPluginMetaInfo.vsixInfos.values())[0].packageJson;
    if (packageJson) {
      delete packageJson.displayName;
      delete packageJson.description;
    } else {
      throw new Error('Invalid package.json');
    }
    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [cheTheiaPluginMetaInfo];
    const result = await cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos);
    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].displayName).toBe(packageJson.name);
  });

  test('no category should use the default category instead', async () => {
    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    const packageJson = Array.from(cheTheiaPluginMetaInfo.vsixInfos.values())[0].packageJson;
    if (packageJson) {
      packageJson.categories = [];
    }
    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [cheTheiaPluginMetaInfo];
    const result = await cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos);
    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('Other');
    expect(console.error as jest.Mock).toHaveBeenCalled();
    const call = (console.error as jest.Mock).mock.calls[0];
    expect(call[0]).toContain('No categories field in package.json found for');
  });

  test('repository in simple format should work as well', async () => {
    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    const packageJson = Array.from(cheTheiaPluginMetaInfo.vsixInfos.values())[0].packageJson;
    const fakeRepository = 'http://my-fake-repository';
    if (packageJson) {
      (packageJson.repository as any) = fakeRepository;
    }
    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [cheTheiaPluginMetaInfo];
    const result = await cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos);
    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].repository).toBe(fakeRepository);
  });

  test('invalid repository in package.json should take repository from yaml', async () => {
    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    const packageJson = Array.from(cheTheiaPluginMetaInfo.vsixInfos.values())[0].packageJson;
    const fakeRepository = 'http://my-fake-repository';
    if (packageJson) {
      // use invalid struct
      (packageJson.repository as any) = { url: { anotherEntry: { repository: fakeRepository } } };
    }
    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [cheTheiaPluginMetaInfo];
    const result = await cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos);
    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].repository).toBe(cheTheiaPluginMetaInfo.repository.url);
  });

  test('no package.json', async () => {
    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    delete Array.from(cheTheiaPluginMetaInfo.vsixInfos.values())[0].packageJson;
    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [cheTheiaPluginMetaInfo];

    await expect(cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos)).rejects.toThrow(
      'No package.json found for'
    );
  });

  test('no publisher field in package.json', async () => {
    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    const packageJson = Array.from(cheTheiaPluginMetaInfo.vsixInfos.values())[0].packageJson;
    if (packageJson) {
      delete packageJson.publisher;
    }
    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [cheTheiaPluginMetaInfo];

    await expect(cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos)).rejects.toThrow(
      'No publisher field in package.json found for'
    );
  });

  test('no name field in package.json', async () => {
    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    const packageJson = Array.from(cheTheiaPluginMetaInfo.vsixInfos.values())[0].packageJson;
    if (packageJson) {
      delete packageJson.name;
    }
    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [cheTheiaPluginMetaInfo];

    await expect(cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos)).rejects.toThrow(
      'No name field in package.json found for'
    );
  });

  test('no version field in package.json', async () => {
    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    const packageJson = Array.from(cheTheiaPluginMetaInfo.vsixInfos.values())[0].packageJson;
    if (packageJson) {
      delete packageJson.version;
    }
    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [cheTheiaPluginMetaInfo];

    await expect(cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos)).rejects.toThrow(
      'No version field in package.json found for'
    );
  });

  test('no icon field in package.json', async () => {
    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    const packageJson = Array.from(cheTheiaPluginMetaInfo.vsixInfos.values())[0].packageJson;
    if (packageJson) {
      delete packageJson.icon;
    }
    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [cheTheiaPluginMetaInfo];
    await cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos);
    expect(console.warn as jest.Mock).toHaveBeenCalled();
    const call = (console.warn as jest.Mock).mock.calls[0];
    expect(call[0]).toContain('No icon field in package.json found for');
  });

  test('no creationDate', async () => {
    const cheTheiaPluginMetaInfo = await generatePluginMetaInfo('my/first/plugin');
    delete Array.from(cheTheiaPluginMetaInfo.vsixInfos.values())[0].creationDate;
    const cheTheiaPluginMetaInfos: CheTheiaPluginMetaInfo[] = [cheTheiaPluginMetaInfo];

    await expect(cheTheiaPluginsMetaYamlGenerator.compute(cheTheiaPluginMetaInfos)).rejects.toThrow(
      'No creation date found for vsix'
    );
  });
});
