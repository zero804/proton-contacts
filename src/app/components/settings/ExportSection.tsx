import React from 'react';
import { c } from 'ttag';
import { PrimaryButton, Alert, useModals, useUserKeys } from 'react-components';
import ExportModal from './ExportModal';

const ExportSection = () => {
    const { createModal } = useModals();
    const [userKeysList, loadingUserKeys] = useUserKeys();
    const handleExport = () => createModal(<ExportModal userKeysList={userKeysList} />);
    return (
        <>
            <Alert>
                {c('Info')
                    .t`The application needs to locally decrypt your contacts before they can be exported. At the end of the process, a VCF file will be generated and you will be able to download it.`}
            </Alert>
            <div className="mb1">
                <PrimaryButton onClick={handleExport} disabled={loadingUserKeys}>
                    {c('Action').t`Export contacts`}
                </PrimaryButton>
            </div>
        </>
    );
};

export default ExportSection;
