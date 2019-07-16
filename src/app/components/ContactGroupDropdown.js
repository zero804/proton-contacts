import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
    Dropdown,
    SmallButton,
    Icon,
    SearchInput,
    Checkbox,
    useContactGroups,
    useModals,
    useApi,
    Tooltip,
    useNotifications,
    useEventManager,
    useContacts
} from 'react-components';
import { c, msgid } from 'ttag';
import { normalize } from 'proton-shared/lib/helpers/string';
import { labelContactEmails, unLabelContactEmails } from 'proton-shared/lib/api/contacts';

import ContactGroupModal from './ContactGroupModal';
import SelectEmailsModal from './SelectEmailsModal';

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
            acc.duplicate[ContactID] = +!!acc.duplicate[ContactID] + 1;

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

const ContactGroupDropdown = ({ children, className, contactEmails, disabled }) => {
    const [keyword, setKeyword] = useState('');
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef();
    const { createNotification } = useNotifications();
    const { call } = useEventManager();
    const api = useApi();
    const { createModal } = useModals();
    const [contacts] = useContacts();
    const [contactGroups] = useContactGroups();
    const [model, setModel] = useState(Object.create(null));

    const normalizedKeyword = normalize(keyword);
    const groups = normalizedKeyword.length
        ? contactGroups.filter(({ Name }) => normalize(Name).includes(normalizedKeyword))
        : contactGroups;

    const handleAdd = () => createModal(<ContactGroupModal />);
    const handleCheck = (contactGroupID) => ({ target }) => setModel({ ...model, [contactGroupID]: +target.checked });

    const handleApply = async () => {
        try {
            setLoading(true);
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
                        return api(labelContactEmails({ LabelID: contactGroupID, ContactEmailIDs: toLabel }));
                    }

                    const toUnlabel = selectedContactEmails
                        .filter(({ LabelIDs = [] }) => LabelIDs.includes(contactGroupID))
                        .map(({ ID }) => ID);
                    return api(unLabelContactEmails({ LabelID: contactGroupID, ContactEmailIDs: toUnlabel }));
                })
            );
            await call();
            createNotification({
                text: c('Info').ngettext(msgid`Contact group apply`, `Contact groups apply`, groupEntries.length)
            });
            dropdownRef.current.close();
            setLoading(false);
        } catch (error) {
            setLoading(false);
            throw error;
        }
    };

    useEffect(() => {
        setModel(getModel(contactGroups, contactEmails));
    }, [contactGroups, contactEmails]);

    return (
        <Dropdown
            caret
            disabled={disabled}
            className={className}
            content={children}
            autoClose={false}
            ref={dropdownRef}
        >
            <div className="flex flex-spacebetween pt1 pl1 pr1 mb1">
                <strong>{c('Label').t`Add to group`}</strong>
                <Tooltip title={c('Info').t`Create a new contact group`}>
                    <SmallButton className="pm-button--primary pm-button--for-icon" onClick={handleAdd}>
                        <Icon name="contacts-groups" fill="light" />+
                    </SmallButton>
                </Tooltip>
            </div>
            <div className="pl1 pr1 mb1">
                <SearchInput
                    value={keyword}
                    onChange={setKeyword}
                    autoFocus={true}
                    placeholder={c('Placeholder').t`Filter groups`}
                />
            </div>
            <div className="mb1">
                <ul className="unstyled m0 dropDown-contentInner">
                    {groups.map(({ ID, Name, Color }) => {
                        return (
                            <li
                                key={ID}
                                className="flex flex-spacebetween flex-nowrap border-bottom border-bottom--dashed pt0-5 pb0-5"
                            >
                                <label htmlFor={ID} className="flex flex-nowrap">
                                    <Icon name="contacts-groups" className="mr0-5" color={Color} />
                                    <span className="ellipsis" title={Name}>
                                        {Name}
                                    </span>
                                </label>
                                <Checkbox
                                    id={ID}
                                    checked={model[ID] === CHECKED}
                                    indeterminate={model[ID] === INDETERMINATE}
                                    onChange={handleCheck(ID)}
                                />
                            </li>
                        );
                    })}
                </ul>
            </div>
            <div className="aligncenter mb1">
                <SmallButton loading={loading} className="pm-button--primary" onClick={handleApply}>{c('Action')
                    .t`Apply`}</SmallButton>
            </div>
        </Dropdown>
    );
};

ContactGroupDropdown.propTypes = {
    children: PropTypes.node.isRequired,
    className: PropTypes.string,
    disabled: PropTypes.bool,
    contactEmails: PropTypes.arrayOf(PropTypes.object)
};

export default ContactGroupDropdown;
