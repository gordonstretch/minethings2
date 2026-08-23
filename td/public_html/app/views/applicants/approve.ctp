<?
$rows = array();
foreach($applicants as $a)
{
	$approveForm = $form->create(null, array('action' => 'approve'));
	$approveForm.= $form->input('Applicant.id', array('type' => 'hidden', 'value' => $a['id']));
	$approveForm.= $form->end('Approve');

	$rows[] = array($a['name'], $a['email'], $a['created'], $approveForm);

}
echo "<table>\n";
echo $html->tableCells($rows);
echo "</table>\n";
?>