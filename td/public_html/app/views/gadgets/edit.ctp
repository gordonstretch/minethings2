<?

echo $form->create('Gadget', array('action' => 'edit'));
echo $form->input('Gadget.id', array('type' => 'hidden'));
echo $form->input('Gadget.display_name');
echo $form->input('Gadget.description');
echo $form->end('submit');


?>