import { Modal as MantineModal } from '@mantine/core';

const sizeMap = { sm: 'sm', md: 'md', lg: 'lg', xl: 'xl' };

const Modal = ({ isOpen, onClose, title, children, size = 'md', showCloseButton = true }) => {
  return (
    <MantineModal
      opened={isOpen}
      onClose={onClose}
      title={title}
      size={sizeMap[size] ?? 'md'}
      withCloseButton={showCloseButton}
      centered
    >
      {children}
    </MantineModal>
  );
};

export default Modal;
