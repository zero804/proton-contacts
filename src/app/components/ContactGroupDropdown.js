import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
    Dropdown,
    SmallButton,
    PrimaryButton,
    Icon,
    Mark,
    SearchInput,
    Checkbox,
    useContactGroups,
    useModals,
    useApi,
    Tooltip,
    useNotifications,
    useEventManager,
    useContacts,
    usePopperAnchor,
    generateUID,
    useLoading
} from 'react-components';
import { c, msgid } from 'ttag';
import { normalize } from 'proton-shared/lib/helpers/string';
import { labelContactEmails, unLabelContactEmails } from 'proton-shared/lib/api/contacts';

import ContactGroupModal from './ContactGroupModal';
import SelectEmailsModal from './SelectEmailsModal';
import ContactGroupDropdownButton from './ContactGroupDropdownButton';

import './ContactGroupDropdown.scss';

const UNCHECKED = 0;
const CHECKED = 1;
const INDETERMINATE = 2;

/**
 * Build initial dropdown model
 * @param {Array} contactGroups
 * @param {Array} contactEmails
 * @returns {Object}
 */
const getModel = (contactGroups = [], contactEmails = []) => {
    if (!contactEmails.length || !contactGroups.length) {
        return Object.create(null);
    }

    return contactGroups.reduce((acc, { ID }) => {
        const inGroup = contactEmails.filter(({ LabelIDs = [] }) => {
            return LabelIDs.includes(ID);
        });
        acc[ID] = inGroup.length ? (contactEmails.length === inGroup.length ? CHECKED : INDETERMINATE) : UNCHECKED;
        return acc;
    }, Object.create(null));
};

/**
 * Collect contacts having multiple emails
 * Used for <SelectEmailsModal />
 * @param {Array} contactEmails
 * @returns {Array} result.contacts
 */
const collectContacts = (contactEmails = [], contacts) => {
    return contactEmails.reduce(
        (acc, { ContactID }) => {
            acc.duplicate[ContactID] = (acc.duplicate[ContactID] || 0) + 1;

            if (acc.duplicate[ContactID] === 2) {
                const contact = contacts.find(({ ID }) => ID === ContactID);
                acc.contacts.push(contact);
            }

            return acc;
        },
        {
            contacts: [],
            duplicate: Object.create(null)
        }
    );
};

const ContactGroupDropdown = ({ children, className, contactEmails, disabled, forToolbar = false }) => {
    const [keyword, setKeyword] = useState('');
    const [loading, withLoading] = useLoading();
    const { anchorRef, isOpen, toggle, close } = usePopperAnchor();
    const { createNotification } = useNotifications();
    const { call } = useEventManager();
    const api = useApi();
    const { createModal } = useModals();
    const [contacts] = useContacts();
    const [contactGroups = []] = useContactGroups();
    const [model, setModel] = useState(Object.create(null));
    const [uid] = useState(generateUID('contactGroupDropdown'));

    const handleAdd = () => {
        createModal(<ContactGroupModal />);
        close();
    };
    const handleCheck = (contactGroupID) => ({ target }) => setModel({ ...model, [contactGroupID]: +target.checked });

    const handleApply = async () => {
        let selectedContactEmails = [...contactEmails];
        const { contacts: collectedContacts } = collectContacts(contactEmails, contacts);

        if (collectedContacts.length) {
            selectedContactEmails = await new Promise((resolve, reject) => {
                createModal(<SelectEmailsModal contacts={collectedContacts} onSubmit={resolve} onClose={reject} />);
            });
        }
        const groupEntries = Object.entries(model);
        await Promise.all(
            groupEntries.map(([contactGroupID, isChecked]) => {
                if (isChecked === INDETERMINATE) {
                    return Promise.resolve();
                }

                if (isChecked === CHECKED) {
                    const toLabel = selectedContactEmails
                        .filter(({ LabelIDs = [] }) => !LabelIDs.includes(contactGroupID))
                        .map(({ ID }) => ID);
                    if (!toLabel.length) {
                        return Promise.resolve();
                    }
                    return api(labelContactEmails({ LabelID: contactGroupID, ContactEmailIDs: toLabel }));
                }

                const toUnlabel = selectedContactEmails
                    .filter(({ LabelIDs = [] }) => LabelIDs.includes(contactGroupID))
                    .map(({ ID }) => ID);

                if (!toUnlabel.length) {
                    return Promise.resolve();
                }
                return api(unLabelContactEmails({ LabelID: contactGroupID, ContactEmailIDs: toUnlabel }));
            })
        );
        await call();
        createNotification({
            text: c('Info').ngettext(msgid`Contact group apply`, `Contact groups apply`, groupEntries.length)
        });
        close();
    };

    useEffect(() => {
        isOpen && setModel(getModel(contactGroups, contactEmails));
    }, [contactGroups, contactEmails, isOpen]);

    const filteredContactGroups = useMemo(() => {
        if (!Array.isArray(contactGroups)) {
            return [];
        }
        const normalizedKeyword = normalize(keyword);
        if (!normalizedKeyword.length) {
            return contactGroups;
        }
        return contactGroups.filter(({ Name }) => normalize(Name).includes(normalizedKeyword));
    }, [keyword, contactGroups]);

    return (
        <>
            <ContactGroupDropdownButton
                caretClassName={forToolbar ? 'toolbar-icon' : ''}
                className={className}
                disabled={disabled}
                buttonRef={anchorRef}
                isOpen={isOpen}
                onClick={toggle}
            >
                {children}
            </ContactGroupDropdownButton>
            <Dropdown
                id="contact-group-dropdown"
                className="contactGroupDropdown"
                isOpen={isOpen}
                anchorRef={anchorRef}
                onClose={close}
                autoClose={false}
                noMaxSize={true}
            >
                <div className="flex flex-spacebetween flex-items-center m1 mb0">
                    <strong>{c('Label').t`Add to group`}</strong>
                    <Tooltip title={c('Info').t`Create a new contact group`}>
                        <SmallButton className="pm-button--primary pm-button--for-icon" onClick={handleAdd}>
                            <Icon name="contacts-groups" />+
                        </SmallButton>
                    </Tooltip>
                </div>
                <div className="m1 mb0">
                    <SearchInput
                        value={keyword}
                        onChange={setKeyword}
                        autoFocus={true}
                        placeholder={c('Placeholder').t`Filter groups`}
                    />
                </div>
                <div className="scroll-if-needed scroll-smooth-touch mt1 contactGroupDropdown-list-container">
                    {filteredContactGroups.length ? (
                        <ul className="unstyled mt0 mb0">
                            {filteredContactGroups.map(({ ID, Name, Color }) => {
                                const checkboxId = `${uid}${ID}`;
                                return (
                                    <li
                                        key={ID}
                                        className="dropDown-item w100 flex flex-nowrap flex-items-center pt0-5 pb0-5 pl1 pr1"
                                    >
                                        <Checkbox
                                            className="flex-item-noshrink"
                                            id={checkboxId}
                                            checked={model[ID] === CHECKED}
                                            indeterminate={model[ID] === INDETERMINATE}
                                            onChange={handleCheck(ID)}
                                        />
                                        <label htmlFor={checkboxId} className="flex flex-item-fluid flex-nowrap">
                                            <Icon
                                                name="contacts-groups"
                                                className="mr0-5 flex-item-noshrink"
                                                color={Color}
                                            />
                                            <span className="flex-item-fluid ellipsis" title={Name}>
                                                <Mark value={keyword}>{Name}</Mark>
                                            </span>
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : keyword ? (
                        <div className="w100 flex flex-nowrap flex-items-center pt0-5 pb0-5 pl1 pr1">
                            <Icon name="attention" className="mr0-5" />
                            {c('Info').t`No group found`}
                        </div>
                    ) : null}
                </div>
                <div className="m1">
                    <PrimaryButton
                        className="w100"
                        loading={loading}
                        disabled={!filteredContactGroups.length}
                        onClick={() => withLoading(handleApply())}
                    >
                        {c('Action').t`Apply`}
                    </PrimaryButton>
                </div>
            </Dropdown>
        </>
    );
};

ContactGroupDropdown.propTypes = {
    children: PropTypes.node.isRequired,
    className: PropTypes.string,
    disabled: PropTypes.bool,
    contactEmails: PropTypes.arrayOf(PropTypes.object),
    forToolbar: PropTypes.bool
};

export default ContactGroupDropdown;
