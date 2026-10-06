"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateUserAction } from "../actions";
import { UserForm } from "./user-form";

export function EditUserForm({
  userId,
  roles,
  defaultValues,
  isSelf,
}: {
  userId: string;
  roles: { id: string; name: string }[];
  defaultValues: { name: string; email: string; roleId: string; isActive: boolean };
  isSelf: boolean;
}) {
  const router = useRouter();
  return (
    <UserForm
      mode="edit"
      roles={roles}
      defaultValues={defaultValues}
      disabledFields={isSelf ? ["roleId", "isActive"] : []}
      onSubmit={async (values) => {
        const result = await updateUserAction(userId, values);
        if (result.ok) {
          toast.success("Cambios guardados");
          router.refresh();
        }
        return result;
      }}
    />
  );
}
