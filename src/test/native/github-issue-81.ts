import { createSandbox } from 'sinon';
import { ContainerGraphService } from '../../services/StorageExplorer/ContainerGraphService';
import { StorageExplorerPanel } from '../../views/StorageExplorer/StorageExplorerPanel';
import { containerType, createdContainer, openStorageExplorer, requestContainerCreation } from '../suite/common/storageExplorerFixture';
import { captureWorkbench } from './captureWorkbench';

export async function run(): Promise<void> {
    const sandbox = createSandbox();
    sandbox.stub(ContainerGraphService.prototype, 'create').resolves(createdContainer);
    try {
        const panel = await openStorageExplorer(sandbox);
        await captureWorkbench(async workbench => {
            // Standalone UI tests drive the dialog; the desktop scenario verifies the host toast.
            await requestContainerCreation(panel);
            return workbench.locator('.notifications-toasts .notification-list-item').filter({
                has: workbench.getByText('Container "Project files" created successfully.', { exact: true }),
            });
        });
    } finally {
        StorageExplorerPanel.closeForContainerType(containerType.id);
        sandbox.restore();
    }
}
